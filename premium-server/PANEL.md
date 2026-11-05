# Poner en marcha el servidor Premium y el panel

Son dos Workers que comparten una base de datos:

- `diva-routine-premium` (`wrangler.toml`): el público, al que llama la app.
- `diva-routine-admin` (`wrangler.admin.toml`): el panel, cerrado con Cloudflare Access.

Todos los comandos se ejecutan en esta carpeta. Las claves se pegan en la terminal cuando las pide
`wrangler`: nunca en un chat ni en estos archivos, porque el repositorio es público.

## 1. Crear lo necesario

```bash
npx wrangler login
npx wrangler kv namespace create USAGE
npx wrangler d1 create diva-routine-admin
```

Pon el id del KV en `wrangler.toml` y el `database_id` en `wrangler.toml` y `wrangler.admin.toml`.
Luego crea las tablas:

```bash
npx wrangler d1 execute diva-routine-admin --remote --file=schema.sql
```

## 2. Secretos y despliegue

```bash
npx wrangler secret put GEMINI_KEY
npx wrangler deploy
npx wrangler secret put ADMIN_EMAILS --config wrangler.admin.toml
npx wrangler secret put GEMINI_KEY --config wrangler.admin.toml
npx wrangler deploy --config wrangler.admin.toml
```

La pestaña Usuarios del panel usa la tabla `grants`. Si la base ya existía, añádela volviendo a
ejecutar `schema.sql`: no borra nada.

```bash
npx wrangler d1 execute diva-routine-admin --remote --file=schema.sql
```

Para que solo valgan los inicios de sesión de la propia app, pon su identificador de cliente de
Google en `GOOGLE_CLIENT_ID` (en `[vars]` de `wrangler.toml`).

El motor de OpenAI nace apagado y la app no lo enseña hasta encenderlo en la pestaña Motores. Para
usarlo, guarda antes su clave en los dos Workers:

```bash
npx wrangler secret put OPENAI_KEY
npx wrangler secret put OPENAI_KEY --config wrangler.admin.toml
```

`ADMIN_EMAILS` son los correos con permiso, separados por comas. La clave de Google en el panel solo
sirve para el botón Probar de la pestaña Estilos.

## 3. Cerrar el panel con Cloudflare Access

Hasta completar este paso el panel responde «aún no está configurado»: no abre a nadie.

1. En Cloudflare: **Workers & Pages** > `diva-routine-admin` > pestaña **Access**.
2. **Protect this Worker behind Access** > **All traffic**.
3. Elige la política (tu cuenta o tu correo) y pulsa **Apply Access**.
4. En **Zero Trust** > **Access** > **Applications**, abre la aplicación y copia su AUD. El nombre del
   equipo es lo que va antes de `.cloudflareaccess.com`.
5. Ponlos en `ACCESS_AUD` y `ACCESS_TEAM` de `wrangler.admin.toml` y vuelve a desplegar el panel.

## 4. Comprobar

- Abre la dirección del panel en una ventana privada: debe pedir iniciar sesión.
- Crea una licencia de cortesía y actívala en la app.

## Estilos de viñeta

Se crean y modifican en la pestaña **Estilos**. Cada ficha guarda sus reglas en D1 y sus imágenes en
KV, y cada cambio crea una versión a la que se puede volver. Las fichas de partida están en
`styles.js`. Un estilo nuevo nace apagado hasta que se activa.

## Qué guarda

Correo de quien compra, final de la clave, cuota y contadores de uso. Nunca claves completas,
imágenes ni instrucciones de quien usa la app. Debe figurar en la política de privacidad de la app.
