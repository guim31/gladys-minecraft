# Servidor Minecraft

Siga su **servidor Minecraft** desde Gladys: si está en línea, cuántos
jugadores hay y quiénes, su versión y su mensaje del día. Gladys puede
reaccionar cuando un jugador llega o se va, o cuando el servidor se detiene, y
enviar un mensaje al chat del juego («¡A comer!») por RCON. Java Edition y
Bedrock Edition, en casa (un NAS, una Raspberry Pi, un PC) o en Internet.

La integración lee el servidor como lo hace la pantalla multijugador del juego
(el «Server List Ping»): sin cuenta de Minecraft, sin plugin, nada que instalar
en el servidor. Esta integración no tiene relación con Mojang ni Microsoft.

> **Desarrollada sin el hardware: sus comentarios son bienvenidos.** La parte
> Java Edition se probó con un servidor vanilla 1.21.11 real; la parte Bedrock
> Edition solo con respuestas documentadas por otros, y todavía no se ha
> probado nada en un Gladys real. Si algo no funciona como se describe, dígalo
> en el [foro de Gladys](https://community.gladysassistant.com) o en las
> [issues](https://github.com/guim31/gladys-minecraft/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Un servidor Minecraft accesible desde Gladys: **Java Edition** 1.7 o
  posterior (vanilla, Paper, Spigot, Fabric, Forge, un proxy BungeeCord o
  Velocity…) o **Bedrock Edition** (Bedrock Dedicated Server, o un servidor con
  un puerto Bedrock). Un servidor en Internet también funciona: Gladys lo lee
  directamente.
- En el `server.properties` del servidor, `enable-status=true` (por defecto).
- Opcional, solo Java Edition: **RCON**, para la lista completa de jugadores y
  los mensajes de chat. En `server.properties`: `enable-rcon=true`,
  `rcon.password=` una contraseña propia, `rcon.port=25575` (por defecto).
  Reinicie el servidor después del cambio.

## Configuración

1. Instale la integración desde el catálogo de Gladys.
2. En **Configuración**, introduzca la **Dirección** del servidor, como en el
   juego: `192.168.1.20`, `mc.example.com`, o `192.168.1.20:25570` cuando el
   puerto no es el predeterminado (Java 25565, Bedrock 19132). Para un nombre
   Java sin puerto, se usa el registro SRV `_minecraft._tcp`, como en el juego.
   Elija la **Edición** y, si lo desea, un **Nombre**.
3. RCON (opcional, Java): marque **Usar RCON**, introduzca el **Puerto RCON** y
   la **Contraseña RCON**.
4. Guarde y haga clic en **Probar la conexión**: el mensaje bajo el botón
   indica, para cada servidor, si responde, su versión, los jugadores y si RCON
   funciona.
5. Abra la pestaña **Descubrir**: un dispositivo por servidor. Haga clic en
   **Añadir**, elija una habitación y guarde.

Hasta tres servidores: rellene las secciones _Segundo servidor_ y _Tercer
servidor_. Otras opciones:

- **Intervalo de actualización**: con qué frecuencia se leen los servidores, de
  15 segundos a 5 minutos (30 segundos por defecto). Una llegada se detecta como
  mucho con este retraso. Una petición de estado ocupa unos cientos de bytes:
  incluso cada 15 segundos, el servidor ni lo nota.
- **Idioma de los nombres de funciones**: inglés, francés, alemán o español
  (francés por defecto). Los nombres se asignan al añadir un dispositivo; el
  texto de los jugadores y los eventos de escena también lo usan.

## El dispositivo de cada servidor

| Función              | Qué es                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------- |
| En línea             | 1 cuando el servidor responde, 0 en cuanto no ha respondido dos veces seguidas           |
| Jugadores conectados | Cuántos jugadores hay en el servidor                                                     |
| Plazas               | El `max-players` del servidor                                                            |
| Jugadores            | Quién juega (solo Java Edition), «Nadie», o una nota cuando la lista es parcial u oculta |
| Versión              | La versión que anuncia el servidor (`1.21.11`, `Paper 1.21.4`, `Velocity 3.4.0`…)        |
| Mensaje del día      | El MOTD, sin sus colores, sus dos líneas unidas por «·»                                  |
| Latencia             | La duración de la petición de estado, en milisegundos                                    |

Un servidor **Bedrock Edition** nunca dice quién juega: su dispositivo no
tiene la función _Jugadores_, y los disparadores de llegada y salida no se
aplican. Cuando el servidor está fuera de línea, _En línea_ y _Jugadores
conectados_ pasan a 0, _Jugadores_ lo indica, y la versión y el MOTD conservan
su último valor.

**Quién juega, en Java Edition**: sin RCON, los nombres vienen de la «muestra»
de la respuesta de estado. El servidor vanilla pone en ella **12 jugadores como
máximo**, elegidos al azar; `hide-online-players=true` la elimina; un jugador
que ha desactivado _Permitir listados del servidor_ aparece como «Anonymous
Player»; algunos plugins y proxys la sustituyen por texto. El texto _Jugadores_
indica cuándo la lista es parcial («y 3 más») u oculta. Con **RCON**, la
integración pide al servidor su lista completa (el comando `list`).

## Panel

Añada el widget **Minecraft** a un panel: para cada servidor (todos, o el
elegido en la configuración del widget), una casilla con los jugadores
conectados y las plazas, verde cuando el servidor responde, roja cuando está
fuera de línea; y una lista con el estado de cada servidor, su versión y quién
juega. Con un solo servidor, una segunda casilla muestra la latencia.

## Escenas

La integración añade sus propias tarjetas al editor de escenas (Gladys 5.1 o
posterior).

### Disparadores

- **Un jugador se ha unido al servidor Minecraft** — filtros: el servidor
  (vacío: cualquiera) y el nombre del jugador (vacío: cualquiera; exactamente
  como en el juego, mayúsculas incluidas). Variables: `player`, `server`,
  `device`, `players_online`.
- **Un jugador ha salido del servidor Minecraft** — mismos filtros. Variables:
  `player`, `server`, `device`, `players_online`, `minutes_played` (el tiempo
  que se quedó, vacío cuando el jugador ya estaba al arrancar la integración).
- **Servidor Minecraft fuera de línea** — el servidor ya no responde, dos veces
  seguidas (una sola respuesta perdida se ignora). Filtro: el servidor.
  Variables: `server`, `device`, `error` (el motivo, en el idioma configurado).

Los disparadores de llegada y salida necesitan la lista **completa** de
jugadores: con RCON siempre; sin RCON, solo mientras el servidor muestre 12
jugadores o menos y ningún nombre oculto. Cuando la lista es parcial, no se
inventa ninguna llegada ni salida: no se indican. Cuando se detiene todo el
servidor, solo se dispara _Servidor Minecraft fuera de línea_, no una salida por
jugador; cuando vuelve, los jugadores que ya estaban no se indican como
llegadas.

### Acciones

- **Enviar un mensaje al chat de Minecraft** — a un servidor, o a todos los
  servidores con RCON cuando el campo servidor está vacío. Una línea, 256
  caracteres como máximo; el mensaje puede usar las variables de la escena
  (`¡Bienvenido {{triggerEvent.data.player}}!`). Los jugadores lo ven como
  `[Rcon] ¡A comer!`: es el comando `say` del servidor, y el único comando que
  envía la integración además de `list`. Requiere RCON (Java Edition). Salida:
  `servers`, cuántos servidores aceptaron el mensaje.

En la pantalla de configuración, **Probar la conexión** lee cada servidor al
momento.

### Ideas de escenas

- **La hora de comer**: a las 19:30, _Enviar un mensaje al chat de Minecraft_
  «¡A comer! Guarden y bajen 🍽️».
- **¿Quién está conectado?** Cuando _Un jugador se ha unido al servidor
  Minecraft_, envíe un mensaje de Gladys a los padres:
  «{{triggerEvent.data.player}} se ha unido a {{triggerEvent.data.server}}».
- **La hora de dormir**: los días de colegio a las 21:00, si _Jugadores
  conectados_ es mayor que 0, enviar «¡Últimos 5 minutos!» al chat y apagar el
  enchufe del PC de juegos a las 21:05.
- **El servidor se ha caído**: cuando _Servidor Minecraft fuera de línea_, envíe
  una notificación con `{{triggerEvent.data.error}}` a la persona que gestiona
  el servidor.

## Solución de problemas

- **«no responde»**: compruebe la dirección y el puerto desde el equipo donde
  se ejecuta Gladys, que `enable-status=true`, y que ningún cortafuegos bloquee
  el puerto (TCP 25565 para Java, **UDP** 19132 para Bedrock). Gladys ejecuta la
  integración en un contenedor Docker: `localhost` allí no es su servidor, use
  su dirección IP en su red.
- **«no es un servidor Minecraft de esta edición»**: algo responde en ese
  puerto, pero no como un servidor Minecraft de la edición elegida: compruebe la
  **Edición** (un servidor Bedrock no responde a la petición Java) y el puerto.
- **«nombre no encontrado»**: el nombre no se resuelve desde Gladys; use la
  dirección IP.
- **«contraseña RCON rechazada»**: no es el `rcon.password` del servidor.
  **«RCON no responde»**: falta `enable-rcon=true`, el **Puerto RCON** es
  incorrecto o un cortafuegos bloquea el puerto. Un problema de RCON nunca deja
  el servidor «fuera de línea»: el estado sigue funcionando.
- **Sin nombres en _Jugadores_**: el servidor los oculta (vea más arriba):
  active RCON.
- Para ver más: ponga `LOG_LEVEL=debug` en el contenedor; la integración
  registra entonces cada lectura, cada llegada y cada salida. Nunca registra la
  contraseña RCON.

## Límites

- Java Edition 1.7 o posterior: los servidores anteriores a 1.7 (2013, el
  antiguo ping «legacy») no son compatibles.
- Quién juega: solo Java Edition, 12 nombres como máximo sin RCON (vea más
  arriba). Bedrock Edition solo indica cuántos jugadores están conectados.
- Una llegada o una salida se detecta en la lectura siguiente (30 segundos por
  defecto): un jugador que llega y se va entre dos lecturas no se detecta.
- Se mantiene abierta una conexión RCON por servidor: el servidor vanilla
  escribe dos líneas en su registro por cada nueva conexión RCON, y volver a
  conectarse cada 30 segundos lo inundaría.
- Los mensajes de chat pasan por `say`: el juego los muestra con el prefijo
  `[Rcon]`. Ningún otro comando es posible desde Gladys, a propósito.
- Sin detección automática de los servidores en la red: Gladys ejecuta la
  integración en un contenedor aislado que no ve los anuncios de red del juego.
  Introduzca la dirección.
- Desarrollada sin un Gladys real y sin un servidor Bedrock real: lo que no se
  ha comprobado está en el README del repositorio.
