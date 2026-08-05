# -*- coding: utf-8 -*-
"""Gera o par de chaves que assina as licencas do aplicativo.

A chave privada fica so no servidor (secret da edge function). A publica vai
embutida no aplicativo, que verifica a licenca sozinho, sem rede — e por isso que
o aplicativo continua funcionando offline depois de ativado.

Curva: ECDSA P-256 (SHA-256). Escolhida porque WebCrypto a suporta em todos os
navegadores e no Deno; Ed25519 ainda nao tem esse alcance.

Uso: python3 scripts/gerar_chaves_licenca.py [--forcar]

Escreve:
  nuvem/chaves/licenca_privada.pem   (NUNCA versionar — o .gitignore ja bloqueia)
  nuvem/chaves/licenca_publica.txt   (SPKI em base64, para colar no aplicativo)
  nuvem/chaves/PRIVADA_BASE64.txt    (PKCS8 em base64, para o secret da edge function)
"""
import os, sys, base64

try:
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
except ImportError:
    print("falta a biblioteca cryptography: python3 -m pip install cryptography")
    sys.exit(2)

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA = os.path.join(RAIZ, "nuvem", "chaves")


def main():
    os.makedirs(PASTA, exist_ok=True)
    priv_pem = os.path.join(PASTA, "licenca_privada.pem")

    if os.path.exists(priv_pem) and "--forcar" not in sys.argv:
        print(f"ja existe {priv_pem}")
        print("trocar a chave invalida TODAS as licencas ja entregues.")
        print("se e isso mesmo que voce quer, rode de novo com --forcar")
        return 1

    chave = ec.generate_private_key(ec.SECP256R1())

    pkcs8 = chave.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    spki = chave.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    open(priv_pem, "wb").write(chave.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ))
    os.chmod(priv_pem, 0o600)

    pub_b64 = base64.b64encode(spki).decode()
    priv_b64 = base64.b64encode(pkcs8).decode()
    open(os.path.join(PASTA, "licenca_publica.txt"), "w").write(pub_b64 + "\n")
    open(os.path.join(PASTA, "PRIVADA_BASE64.txt"), "w").write(priv_b64 + "\n")
    os.chmod(os.path.join(PASTA, "PRIVADA_BASE64.txt"), 0o600)

    print("par de chaves gerado em nuvem/chaves/\n")
    print("1) no servidor (uma vez):")
    print(f"   supabase secrets set REVALIDA_CHAVE_PRIVADA='{priv_b64}'\n")
    print("2) no aplicativo: a chave publica abaixo vai em modelo/app_template.html")
    print("   (constante CHAVE_LICENCA). O script 08 nao a toca.")
    print(f"   {pub_b64}\n")
    print("a privada nunca sai do servidor. se vazar, gere outra com --forcar")
    print("e reative os assinantes — as licencas antigas param de valer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
