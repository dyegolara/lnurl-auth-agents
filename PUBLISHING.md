# Plan de Publicación — `lnurl-auth` (LUD-04)

Skill de LNURL-auth ("Sign in with Lightning") para agentes LLM / OpenClaw.
Sin nodo Lightning, sin pago, sin costo. Listo para publicar; ver "Bloqueos"
al final sobre el paso de GitHub.

---

## 1. Estado previo a publicar

- ✅ `SKILL.md` con frontmatter válido (`name`, `description`, `license`,
  `homepage`, `metadata`) — validado con `quick_validate.py` de `skill-creator`.
- ✅ Dependencias (`@noble/secp256k1`, `bech32`) **vendorizadas** en
  `node_modules/` y commiteadas → funciona **offline en runtime** (sin
  `npm install`). Documentado en `SKILL.md`.
- ✅ Tests: `npm test` corre `selftest.js` (mock local) + `test/unit.js`
  (vectores oficiales LUD-01 de bech32 y LUD-04 de firma). 9/9 + 8/8 PASS.
- ✅ `README.md`, `LICENSE` (MIT), `examples/`.
- ✅ Login real contra servicios públicos: **bitsimp.com** y
  **lightninglogin.live** devolvieron `{"status":"OK"}` (ver sección de pruebas).
- ⚠️ **Bloqueo GitHub**: el token `gh` autenticado como `dyegolara` NO tiene
  scope para crear repos (403 en `createRepository` y en `POST /user/repos`).
  No se pudo crear `openclaw-lnurl-auth` ni hacer push con este token.
  El repo git local ya está commiteado (26 archivos) y con el remote `origin`
  configurado; falta solo `git push` a un repo que deba existir.

---

## 2. Publicar en GitHub (requisito previo para ClawHub)

> El token actual no puede crear el repo. Usar un token con scope `repo` /
> `public_repo`, o crear el repo vía github.com (sesión logueada) y luego pushear.

```bash
# Opción A — gh con token que SÍ tenga scope de repo:
gh repo create openclaw-lnurl-auth --public --source . --remote origin --push \
  --description "LNURL-auth (LUD-04) signer skill for OpenClaw / LLM agents — no Lightning node, no payment, no cost."

# Opción B — repo ya creado vía github.com UI (estando logueado):
git remote add origin https://github.com/dyegolara/openclaw-lnurl-auth.git
git push -u origin main
```

Notas:
- **NO usar GitHub Actions**: el token no tiene `workflow` scope y el skill no
  los necesita. Si se añaden CI workflows en el futuro, requerirá un token con
  `workflow` scope.
- No se habilitó el skill globalmente ni se tocó la config del gateway sin
  confirmación de Amadeo.

---

## 3. Publicar en ClawHub (registro público: https://clawhub.ai)

ClawHub es el registro principal de skills para OpenClaw. Proceso (según el
skill `clawhub`):

```bash
# 1) Instalar CLI de publicador
npm i -g clawhub

# 2) Autenticarse (abre navegador / token de editor)
clawhub login
clawhub whoami

# 3) Publicar desde la raíz del skill (donde está SKILL.md)
clawhub skill publish .
clawhub skill publish . --version 1.1.0
```

Verificación posterior:
```bash
openclaw skills search lnurl-auth
openclaw skills verify lnurl-auth
openclaw skills install lnurl-auth
```

---

## 4. Otras venues (opcionales)

- **Instalación directa desde git** (sin registro):
  `openclaw skills install https://github.com/dyegolara/openclaw-lnurl-auth`
  o bien `git clone` y colocar en `~/.openclaw/.../skills/lnurl-auth/`.
- **Listar en directorios / awesome-lists** de agent-skills (divulgación).
- **Plugin de OpenClaw**: el skill ya cumple el esquema esperado
  (`SKILL.md` + `scripts/` + `references/`/`assets/` opcionales, frontmatter
  obligatorio). No requiere empaquetado extra para ser instalado por
  `openclaw skills install`.

---

## 5. Checklist de requisitos (cumplidos salvo lo bloqueado)

- [x] `SKILL.md` con `name` + `description` (obligatorios)
- [x] Frontmatter correcto (`license: MIT`, `homepage`, `metadata`)
- [x] Funciona sin red en runtime (deps vendorizadas; `npm install` documentado)
- [x] `npm test` pasa (mock + unit con vectores oficiales LUD-01/LUD-04)
- [x] `README.md` con ejemplos de uso
- [x] `LICENSE` (MIT)
- [x] Sin costo, sin nodo Lightning, sin red en runtime (solo el callback)
- [x] Login real verificado en bitsimp.com y lightninglogin.live (status OK)
- [ ] Crear repo en GitHub (BLOQUEADO por scope del token `gh`)
- [ ] `clawhub login` + `clawhub skill publish` (requiere cuenta ClawHub)

---

## 6. Pruebas reales realizadas (evidencia)

| Servicio | Resultado | Respuesta |
|---|---|---|
| bitsimp.com | ✅ ÉXITO | `HTTP 200 {"status":"OK","success":true}` |
| lightninglogin.live | ✅ ÉXITO | `HTTP 200 {"status":"OK"}` |

Método: se abrió el sitio con `openclaw browser`, se pulsó "Sign in with
Lightning", se capturó el `lnurl1...` (desde el atributo `lightning:` del
enlace "Open Lightning Wallet"), y se ejecutó
`node lnurl_auth.js <lnurl1>`. Ambos cerraron el handshake con `status: OK`.
No se usó nodo Lightning ni se realizó pago alguno.

---

## 7. Bloqueos / limitaciones

1. **GitHub**: token `gh` (dyegolara) sin scope de creación de repositorios
   → no se pudo crear/pushear automáticamente. Remediación en §2.
2. No se habilitó el skill de forma global ni se publicó externamente sin
   confirmación de Amadeo (restricción de la tarea).
3. El linking key por defecto es derivado por dominio desde un secreto local
   (no es la identidad de una wallet de usuario real); adecuado para auth de
   agente, no para suplantar la identidad de un humano.
