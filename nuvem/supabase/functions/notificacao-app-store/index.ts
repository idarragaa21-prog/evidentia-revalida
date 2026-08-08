// App Store Server Notifications V2. Este endpoint e publico somente no nivel
// HTTP: toda mensagem precisa passar pela cadeia Apple, assinatura, bundle,
// appAppleId, ambiente e OCSP antes de qualquer mutacao.

import { Buffer } from "node:buffer";
import {
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
} from "npm:@apple/app-store-server-library@3.1.0";
import { ErroHttp, lerJsonLimitado, sha256Hex } from "../_shared/http_security.ts";
import { decidirNotificacaoApple } from "../_shared/notificacoes_lojas.ts";
import {
  configuracaoSupabaseWebhook,
  encerrarCompraNativa,
  finalizarNotificacao,
  reservarNotificacao,
  respostaWebhook,
} from "../_shared/notificacoes_backend.ts";

type VerificadorApple = {
  ambiente: "production" | "sandbox";
  instancia: SignedDataVerifier;
};

let verificadoresCache: VerificadorApple[] | null = null;

function verificadoresApple(): VerificadorApple[] {
  if (verificadoresCache) return verificadoresCache;
  const bundleId = Deno.env.get("APPLE_BUNDLE_ID") ?? "";
  const ambiente = (Deno.env.get("APPLE_APP_STORE_ENVIRONMENT") ?? "production").toLowerCase();
  const appIdTexto = Deno.env.get("APPLE_APP_ID") ?? "";
  const certificadosTexto = Deno.env.get("APPLE_ROOT_CA_CERTIFICATES_BASE64") ?? "";
  if (!bundleId || !["production", "sandbox", "both"].includes(ambiente) || !certificadosTexto) {
    throw new ErroHttp(503, "apple_mal_configurada");
  }

  let certificados: Buffer[];
  try {
    const lista = JSON.parse(certificadosTexto);
    if (!Array.isArray(lista) || lista.length < 1 || lista.length > 8) throw new Error();
    certificados = lista.map((valor) => {
      const texto = String(valor);
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(texto)) throw new Error();
      const der = Buffer.from(texto, "base64");
      if (der.byteLength < 256 || der.byteLength > 16_384) throw new Error();
      return der;
    });
  } catch {
    throw new ErroHttp(503, "certificados_apple_invalidos");
  }

  const appId = Number(appIdTexto);
  if (["production", "both"].includes(ambiente) &&
      (!Number.isSafeInteger(appId) || appId <= 0)) {
    throw new ErroHttp(503, "apple_app_id_invalido");
  }
  try {
    const saida: VerificadorApple[] = [];
    if (["production", "both"].includes(ambiente)) {
      saida.push({
        ambiente: "production",
        instancia: new SignedDataVerifier(
          certificados, true, Environment.PRODUCTION, bundleId, appId,
        ),
      });
    }
    if (["sandbox", "both"].includes(ambiente)) {
      saida.push({
        ambiente: "sandbox",
        instancia: new SignedDataVerifier(
          certificados, true, Environment.SANDBOX, bundleId,
        ),
      });
    }
    verificadoresCache = saida;
    return saida;
  } catch {
    throw new ErroHttp(503, "certificados_apple_invalidos");
  }
}

async function verificarNotificacaoApple(signedPayload: string): Promise<{
  ambiente: "production" | "sandbox";
  verificador: SignedDataVerifier;
  payload: Awaited<ReturnType<SignedDataVerifier["verifyAndDecodeNotification"]>>;
}> {
  let falhaReintentavel = false;
  for (const candidato of verificadoresApple()) {
    try {
      const payload = await candidato.instancia.verifyAndDecodeNotification(signedPayload);
      return { ambiente: candidato.ambiente, verificador: candidato.instancia, payload };
    } catch (erro) {
      if (erro instanceof VerificationException &&
          erro.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) {
        falhaReintentavel = true;
      }
    }
  }
  throw new ErroHttp(falhaReintentavel ? 503 : 401,
    falhaReintentavel ? "apple_verificacao_temporaria" : "assinatura_apple_invalida");
}

function erroVerificacaoTransacao(erro: unknown): ErroHttp {
  if (erro instanceof VerificationException &&
      erro.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) {
    return new ErroHttp(503, "apple_verificacao_temporaria");
  }
  return new ErroHttp(401, "transacao_apple_invalida");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respostaWebhook(405, "metodo_nao_suportado");

  let eventoId = "";
  try {
    const corpo = await lerJsonLimitado(req, 300_000);
    if (Object.keys(corpo).some((chave) => chave !== "signedPayload")) {
      throw new ErroHttp(400, "campos_desconhecidos");
    }
    const signedPayload = String(corpo.signedPayload ?? "").trim();
    if (signedPayload.length < 20 || signedPayload.length > 256_000) {
      throw new ErroHttp(400, "signed_payload_invalido");
    }

    const verificada = await verificarNotificacaoApple(signedPayload);
    const tipo = String(verificada.payload.notificationType ?? "UNKNOWN").toUpperCase();
    eventoId = String(verificada.payload.notificationUUID ?? "").trim();
    if (eventoId.length < 1 || eventoId.length > 240) {
      throw new ErroHttp(400, "notification_uuid_invalido");
    }

    let transacao: Awaited<ReturnType<SignedDataVerifier["verifyAndDecodeTransaction"]>> | null = null;
    if (["REFUND", "REVOKE"].includes(tipo)) {
      const signedTransaction = verificada.payload.data?.signedTransactionInfo;
      if (!signedTransaction) throw new ErroHttp(503, "transacao_apple_ausente");
      try {
        transacao = await verificada.verificador.verifyAndDecodeTransaction(signedTransaction);
      } catch (erro) {
        throw erroVerificacaoTransacao(erro);
      }
    }
    const decisao = decidirNotificacaoApple(tipo, transacao);
    const cfg = configuracaoSupabaseWebhook();
    const payloadHash = await sha256Hex(signedPayload);
    const reserva = await reservarNotificacao(cfg, "apple", eventoId, payloadHash, tipo);
    if (!reserva.processar) {
      return reserva.repetida ? respostaWebhook() : respostaWebhook(503, "evento_em_processamento");
    }

    if (decisao.acao === "reintentar") {
      await finalizarNotificacao(cfg, {
        plataforma: "apple", eventoId, status: "erro_temporario", erroCodigo: decisao.motivo,
        detalhes: { notification_type: tipo, ambiente: verificada.ambiente },
      });
      return respostaWebhook(503, decisao.motivo);
    }
    if (decisao.acao === "ignorar") {
      const permanente = ["REFUND", "REVOKE"].includes(tipo);
      await finalizarNotificacao(cfg, {
        plataforma: "apple", eventoId,
        status: permanente ? "erro_permanente" : "ignorada",
        erroCodigo: permanente ? decisao.motivo : null,
        detalhes: { notification_type: tipo, ambiente: verificada.ambiente },
      });
      return respostaWebhook();
    }

    const contaHash = await sha256Hex(decisao.conta);
    let encerramento: Awaited<ReturnType<typeof encerrarCompraNativa>>;
    try {
      encerramento = await encerrarCompraNativa(cfg, {
        plataforma: "apple", transacaoId: decisao.transacaoId,
        status: decisao.status, motivo: decisao.motivo,
        produtoId: decisao.produtoId, contaHash,
      });
    } catch (erro) {
      if (erro instanceof ErroHttp && erro.status === 422) {
        await finalizarNotificacao(cfg, {
          plataforma: "apple", eventoId, status: "erro_permanente", erroCodigo: erro.codigo,
          transacaoId: decisao.transacaoId, produtoId: decisao.produtoId,
        });
        return respostaWebhook();
      }
      throw erro;
    }
    if (!encerramento.ok) {
      await finalizarNotificacao(cfg, {
        plataforma: "apple", eventoId, status: "erro_temporario",
        erroCodigo: String(encerramento.motivo ?? "compra_nao_encontrada"),
        transacaoId: decisao.transacaoId, produtoId: decisao.produtoId,
      });
      return respostaWebhook(503, "compra_ainda_nao_encontrada");
    }
    await finalizarNotificacao(cfg, {
      plataforma: "apple", eventoId, status: "processada",
      transacaoId: decisao.transacaoId, produtoId: decisao.produtoId,
      compraId: encerramento.compra_id ?? null,
      detalhes: { notification_type: tipo, ambiente: verificada.ambiente },
    });
    return respostaWebhook();
  } catch (erro) {
    if (erro instanceof ErroHttp) {
      return respostaWebhook(erro.status === 422 ? 400 : erro.status, erro.codigo);
    }
    return respostaWebhook(500, eventoId ? "falha_ao_processar_evento" : "falha_interna");
  }
});
