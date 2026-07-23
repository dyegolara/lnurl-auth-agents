# Plan de publicación — `lnurl-auth` (LUD-04)

Herramienta de LNURL-auth ("Sign in with Lightning") para **cualquier agente LLM**
(OpenClaw, Codex, Cursor, Claude Code, OpenCode, etc.). Sin nodo Lightning, sin
pago, sin costo.

---

## 1. Estado actual

- ✅ Código estable con 5 bugs corregidos (code review):
  - `--generate` ahora sobreescribe keyfiles existentes
  - `hexToBytes` rechaza hex de longitud impar (antes silenciosamente lo corregía)
  - Código muerto eliminado (`resolveMasterSecret` y `N` sin usar)
  - DRY: la generación/persistencia de keyfile es un solo code path
- ✅ Tests: `npm test` = `selftest.js` (14 tests) + `test/unit.js` (8 tests) = **22/22 PASS**
- ✅ `SKILL.md` con frontmatter válido (`name`, `description`, `license`, `homepage`, `metadata`)
- ✅ Dependencias (`@noble/secp256k1`, `bech32`) **vendorizadas** en `node_modules/`
- ✅ Documentación completa: `README.md` (con diagramas mermaid), `SKILL.md`, `AGENTS.md`
- ✅ `LICENSE` (MIT), `examples/`
- ✅ Login real verificado en bitsimp.com y lightninglogin.live (status OK)
- ✅ Repo en GitHub: https://github.com/dyegolara/lnurl-auth-agents

---

## 2. Tests

```bash
npm test   # 22/22 passing (14 selftest + 8 unit)
```

| Suite | Cobertura |
|---|---|
| `selftest.js` | E2E contra mock server: happy path, replay, dry-run, k1 corrupto, key derivation, `--generate` overwrite, hex-length impar |
| `test/unit.js` | Vectores oficiales LUD-01 (bech32) y LUD-04 (firma), DER encode/decode, HMAC key derivation, sign→verify roundtrip |

---

## 3. Publicar en ClawHub (registro público: https://clawhub.ai)

```bash
# 1) Instalar CLI
npm i -g clawhub

# 2) Autenticarse
clawhub login
clawhub whoami

# 3) Publicar
clawhub skill publish .
clawhub skill publish . --version 1.1.0
```

Verificación:
```bash
openclaw skills search lnurl-auth
openclaw skills verify lnurl-auth
openclaw skills install lnurl-auth
```

---

## 4. Otras venues

- **Instalación directa desde git**:
  `openclaw skills install https://github.com/dyegolara/lnurl-auth-agents`
- **npm** (opcional): `package.json` ya tiene `"bin": {"lnurl-auth": "lnurl_auth.js"}`

---

## 5. Checklist de requisitos

- [x] `SKILL.md` con `name` + `description`
- [x] Frontmatter correcto (MIT, homepage, metadata)
- [x] Funciona sin red en runtime (deps vendorizadas)
- [x] `npm test` pasa 22/22
- [x] `README.md` con diagramas mermaid
- [x] `AGENTS.md` con guía para LLMs
- [x] `LICENSE` (MIT)
- [x] Sin costo, sin nodo Lightning
- [x] Login real verificado (bitsimp.com, lightninglogin.live)
- [x] Repo en GitHub: https://github.com/dyegolara/lnurl-auth-agents
- [ ] `clawhub login` + `clawhub skill publish` (requiere cuenta ClawHub)

---

## 6. Evidencia de pruebas reales

| Servicio | Resultado | Respuesta |
|---|---|---|
| bitsimp.com | Éxito | `HTTP 200 {"status":"OK","success":true}` |
| lightninglogin.live | Éxito | `HTTP 200 {"status":"OK"}` |

Método: se navegó el sitio, se pulsó "Sign in with Lightning", se capturó el
`lnurl1...` del enlace "Open Lightning Wallet", y se ejecutó
`node lnurl_auth.js <lnurl1>`. Ambos cerraron el handshake con `status: OK`.