# Diva Routine

**Español** · [English](README.en.md)

App local para montar rutinas de entrenamiento de jazz a partir de videos y fotos.

## Cómo se usa

1. **Biblioteca.** Todo se ve en recuadros: carpetas (con un mosaico de lo que tienen dentro), videos e imágenes. A la derecha está el **menú de opciones**:
   - **Importar**: en el cuadro pega links de YouTube o Instagram (uno por línea), una **lista de reproducción de YouTube**, una **colección de tus Guardados de Instagram** (con tu cuenta conectada, ver abajo) o **imágenes** (clic derecho → Pegar, o Ctrl+V). Se ven antes y se suben al pulsar **Importar**. Pegar en cualquier otro sitio no sube nada.
   - **Subir**: videos o fotos del ordenador. También puedes arrastrarlos a la cuadrícula (o un `.txt` con links).
   - **Carpeta**: carpeta nueva; dentro de una carpeta, crea una **subcarpeta** (a cualquier profundidad). Dentro de una carpeta se importa en ella; su nombre se cambia arriba, donde también se ve la ruta (Biblioteca › jszz › giros).
   - **Arrastrar**: un video (o una carpeta) se arrastra sobre una carpeta para meterlo dentro, o sobre la ruta de arriba para sacarlo a ese nivel. Si está seleccionado junto con otros, se mueven todos.
   - **Instagram**: conectar tu cuenta, importar colecciones y sincronizarlas.
   - **Todo**: selecciona o quita todo lo que se ve.
   - **Rutina**, **Mover** y **Borrar**: actúan sobre lo seleccionado en las casillas.
   - Cada recuadro tiene además una ✕ para borrarlo (una carpeta, con todo lo que tiene dentro).
2. **Extracción (IA), solo cuando tú lo pides.** En la Biblioteca se ven los propios videos y fotos; los videos se descargan solos, pero no se analizan. Los ejercicios y sus dibujos se sacan cuando seleccionas y pulsas **Dibujos → Sacar dibujos** (o con el botón **Sacar dibujos de todo el video** de cada video): se detecta la pose fotograma a fotograma (MediaPipe), se **separa el video en ejercicios** por las pausas y de cada uno se sacan sus momentos clave dibujados y su técnica (kicks, extensiones, passé, plié, giros, saltos, suelo, inclinaciones, contracciones, relevé, brazos…). Los dibujos se ven en **Rutinas**.
3. **Elegir el tramo (timeline).** En el panel **Dibujos**, cada video seleccionado tiene **Elegir tramo** (o abre el video desde la Biblioteca). En el **timeline** arrastra para marcar el tramo (o mueve las asas), afina los tiempos escribiéndolos o con −/+ (0,1 s), haz zoom y pulsa **Marcar este tramo** (puedes marcar varios). Los dibujos se sacan **solo de esos tramos** al pulsar **Sacar dibujos**; si un video no tiene tramos marcados, la IA lo separa en ejercicios ella sola. Con **← Volver a sacar dibujos** sigues donde estabas. Cada tramo se puede cambiar, renombrar, cambiar de categoría o borrar.
4. **Sacar dibujos.** En la Biblioteca marca carpetas o videos en sus casillas y pulsa **Dibujos** en el menú (se destaca en cuanto seleccionas algo) → **Sacar dibujos**. Los dibujos van al apartado **Rutinas**.
5. **Rutinas.** Arriba, las rutinas montadas; debajo, **todos los dibujos creados**. Marca los dibujos en el orden de la rutina (los recién sacados llegan ya marcados), pulsa **Rutina**, elige el orden — **como los has elegido** o **automático** (calentamiento → centro → kicks → giros → saltos → diagonales → suelo → estiramientos) — y **Crear rutina** (o añádelos a una existente). También puedes **arrastrar** un dibujo hasta una rutina para añadirlo (si tienes varios marcados y arrastras uno, van todos, en su orden; los que ya estaban no se repiten), o soltarlo en **+ Nueva rutina** para crear una con él.
6. **Página principal.** Marca rutinas y pulsa **Inicio** (o, dentro de una rutina, **Añadir a inicio**): aparecen arriba en la Biblioteca y se abren con un clic. La ✕ las quita de ahí sin borrarlas. Sale la tabla visual: secuencia dibujada de cada ejercicio con su técnica. En la tabla puedes reordenar (arrastrando o con ↑ ↓), poner repeticiones y notas, e **imprimir o guardar en PDF** (A4 horizontal).

Las viñetas tienen estilo de póster de ejercicios: en cada **fase** del movimiento (Inicio → Fase 2 → … → Final) se toma el fotograma real, se recorta a la persona (sin fondo) y se pasa a ilustración (colores planos, líneas de tinta y contorno), sobre fondo blanco, con flechas verdes entre fases y todas a la misma escala. La tabla de la rutina se separa en secciones de colores por categoría. Si alguna viñeta no se puede hacer, se usa una figura dibujada a partir de la pose (lado derecho en color fuerte, izquierdo en claro).

## Instalar en Windows

Con el instalador `Diva-Routine-Setup-X.Y.Z.exe`: doble clic, elegir carpeta (o dejar la que propone) y listo. Crea los accesos en el escritorio y en el menú Inicio, no pide permisos de administrador y se abre en su propia ventana. No hace falta tener Node.js.

- Como el instalador no está firmado con un certificado, Windows puede decir «Windows protegió su PC»: pulsa **Más información → Ejecutar de todas formas**.
- Los datos (videos, dibujos, rutinas, sesiones) van en `%LOCALAPPDATA%\Diva Routine`. Se conservan al actualizar y al desinstalar.
- El inicio de sesión con Google se abre en el navegador (Google no deja hacerlo dentro de una app); al terminar, la app vuelve sola.
- Si al crear el instalador ya tenías configurados Google y Firebase, el instalador los lleva: quien lo instale solo tiene que iniciar sesión.

### Actualizaciones

La app instalada mira al abrirse (y cada 3 horas) si hay una versión publicada más nueva. Si la hay, la descarga en segundo plano y avisa con una **notificación de Windows** y un aviso arriba en la app: **Actualizar ahora** la instala y vuelve a abrir la app en unos segundos; con **Más tarde**, se instala sola al cerrarla. En **Ajustes** se ve la versión y hay un botón **Buscar actualizaciones**.

### Publicar una versión nueva

Las versiones se publican en GitHub Releases, en el repositorio indicado en `package.json` (`build.publish`, ahora `DivolandiaLabs/diva-routine`). Tiene que ser **público** para que las apps instaladas puedan leerlo sin contraseña.

1. Sube el número de versión en `package.json` (por ejemplo `1.0.1`).
2. `npm run instalador` → en `dist/` quedan `Diva-Routine-Setup-1.0.1.exe`, su `.blockmap` y `latest.yml`.
3. En GitHub: **Releases → Draft a new release**, etiqueta `v1.0.1`, sube esos tres archivos y **Publish release**. (O, con un token de GitHub en la variable `GH_TOKEN`, `npm run publicar` lo hace solo.)

Las apps instaladas la verán en cuanto se abran (o en 3 horas como mucho).

## Arrancar sin instalar (para desarrollar)

Necesita Node.js 18 o superior.

```
npm start
```

O doble clic en `Iniciar Diva Routine.bat`. Se abre en el navegador, en http://localhost:5177, y usa la carpeta `data` de aquí. `npm run app` la abre en su ventana, como la instalada (sin actualizaciones). Para crear el instalador hace falta `npm install` una vez.

La primera extracción descarga el detector de pose desde internet (unos segundos).

## Descargas de YouTube

Se hacen con [yt-dlp](https://github.com/yt-dlp/yt-dlp) (`pip install yt-dlp`).

## Tu cuenta de Instagram (colecciones privadas)

En el menú de la Biblioteca, **Instagram → Conectar Instagram**, y pega el valor de tu cookie `sessionid` de instagram.com (la ventana explica cómo sacarlo con F12), o sube un `cookies.txt` exportado. Con la cuenta conectada:

- **Importar colecciones**: eliges tus colecciones de Guardados y cada una se convierte en una carpeta (o todas en la que digas). También puedes pegar el link de una colección (`instagram.com/tu_usuario/saved/nombre/123…/`) en **Importar**: fuera de las carpetas crea la suya; dentro de una carpeta, va a esa.
- **Sincronizar**: trae los posts nuevos que hayas guardado en esas colecciones. Se hace solo al abrir la app (como mucho cada 6 horas) y con el botón **Sincronizar** de la carpeta. Lo que borres no vuelve. La ✕ junto al nombre de la colección deja de sincronizarla.
- Los videos y fotos se descargan directamente con tu sesión (de los carruseles, cada video por separado).

La sesión se guarda solo en `data/instagram.json`, en este ordenador, y solo se envía a Instagram. Funciona como tu contraseña: no la compartas. Si cierras sesión en Instagram, deja de valer y la app te pedirá volver a conectar. Instagram no permite oficialmente este uso automatizado; la app hace pocas peticiones y con pausas, pero úsala con moderación.

Sin conectar la cuenta, muchos posts de Instagram no se pueden descargar: descárgalos desde el móvil y súbelos con **Subir el archivo** en el propio video.

## Varios ordenadores: con tu cuenta de Google (recomendado)

En **Ajustes → Tu cuenta de Google** inicias sesión con Google y la app guarda todo (videos, fotos, dibujos, rutinas) en tu Google Drive, en una carpeta privada de la app (no se ve entre tus archivos), y lo mantiene igual en todos los ordenadores donde inicies sesión, estés donde estés. Gratis hasta 15 GB.

- **Una sola vez** hay que crear el identificador de Google (gratis, ~10 min; los pasos están en Ajustes): proyecto en console.cloud.google.com, activar la Google Drive API, configurar la pantalla de permisos (Externo, **Publicar app** para que no caduque cada 7 días) y crear un cliente **App de escritorio** → descargar el JSON y subirlo en Ajustes. Se guarda junto a la app (`google-client.json`), así que al copiar la app a otro ordenador ya va.
- La app solo pide permiso para su carpeta privada y para los archivos que ella misma crea (los videos que compartes); nunca ve el resto de tu Drive.
- En cada ordenador: **Iniciar sesión con Google**. La sesión se guarda en `data/google.json` de ese ordenador y solo se envía a Google.
- Se sincroniza sola unos segundos después de cada cambio y cada minuto. Los cambios se juntan elemento a elemento: puedes usarla en dos sitios a la vez; si se cambia lo mismo en los dos, se queda el cambio más reciente, y lo borrado queda borrado.

## Compartir con otras personas

Se puede compartir, con el Gmail de cada persona:

- **Una carpeta de la Biblioteca** (con sus subcarpetas): entra en ella y pulsa **Compartir**. Los colaboradores la ven en su Biblioteca y pueden **añadir** videos, fotos y subcarpetas, y cambiar nombres. Lo que añade una persona solo lo quitan ella o quien comparte la carpeta (en los recuadros sale «de ana» en lo que añadió otra persona).
- **Una rutina**: en la rutina, **Editores**. Pueden cambiarla: añadir o quitar dibujos, orden, repeticiones y notas. Lo de «en inicio» es de cada uno.
- **Un dibujo**: en **Rutinas**, elige el dibujo y pulsa **Compartir**. Lo ven en su apartado Rutinas, pueden cambiarlo y usarlo en sus rutinas.

A cada persona le aparece en su app en cuanto inicia sesión con ese Gmail (y lo nuevo, en uno o dos minutos). En la misma ventana de **Compartir** se ve quién está, se invita y se quita gente (solo quien lo comparte), y se puede **Dejar de compartir** (lo conservas, con lo que añadieron) o **Salir** (si te lo compartieron: se quita de tu app; lo que añadiste tú a una carpeta se te queda).

Cómo va por dentro: usa **Firebase** (de Google, gratis para este uso). Lo compartido (carpetas, rutinas, dibujos y quién está en cada cosa) va a su base de datos Firestore, protegida con unas reglas que solo dejan verlo a quien está invitado. Los videos y fotos de una carpeta compartida los sube quien los añade a **su** Google Drive (carpeta «Diva Routine · compartido»), con un enlace que solo conoce la app; los demás los descargan de ahí.

- **Una sola vez**: en **Ajustes → Compartir con otras personas** están los pasos: crear el proyecto de Firebase sobre el mismo proyecto de Google Cloud del identificador, activar el acceso con Google, crear la base de datos Firestore, **pegar las reglas** (botón Copiar) y pegar en la app el bloque `firebaseConfig`. Se guarda junto a la app (`firebase-config.json`).
- **Las otras personas** necesitan la app (cópiales la carpeta, sin `data`, con `google-client.json` y `firebase-config.json`) e iniciar sesión con su Gmail en Ajustes. Si en Google Auth Platform la app no está **En producción**, añádelas como usuarios de prueba.
- Lo de cada ordenador (qué se ha bajado y subido de cada cosa compartida) va en `data/colabora.json`.

## Varios ordenadores: con una carpeta compartida

Otra forma, sin cuenta de Google: todas las instalaciones usan **la misma carpeta de datos**, en un sitio compartido: un disco de la red de casa (por ejemplo `\\192.168.8.1\disk1_part1\Diva Routine`) o una carpeta de OneDrive, Google Drive o Dropbox (para ordenadores en sitios distintos).

1. En el primer ordenador: **Ajustes → Carpeta compartida → Usar esta carpeta**. Si está vacía, se copian allí tus datos; la app se reinicia.
2. En cada ordenador nuevo: copia la carpeta de la app (sin `data`), instala Node.js, ábrela y en **Ajustes** pon la misma carpeta: como ya tiene datos, usa esos.

Cada ordenador ve los cambios de los demás en unos segundos, y la app avisa arriba si está abierta a la vez en otro (si dos cambian lo mismo a la vez, se queda el último). La sesión de Instagram **no** se comparte: se conecta en cada ordenador. La carpeta elegida se guarda en `config.json` (junto a la app); admite `%OneDrive%`, `%USERPROFILE%`…, para que la misma valga en todos.

## Notas

- Las descargas pendientes se retoman solas al abrir la app (aunque se cerrara o recargara a medias). Si una falla, su recuadro dice «No se pudo descargar» (el motivo, al pasar el ratón) y se puede reintentar desde el propio video.
- En la Biblioteca los videos se ven con una imagen de portada (un fotograma) que se hace sola tras descargarlos.
- Izquierda/derecha son las de la persona que baila. Si el video está en espejo, salen invertidas.
- Los datos están en `data/db.json` y los archivos en `data/uploads/` (en la app instalada, dentro de `%LOCALAPPDATA%\Diva Routine`). Copia la carpeta `data` para hacer copia de seguridad.
