# Roles y permisos

| Rol | Acceso |
|---|---|
| `owner` | Configuración, usuarios y acceso completo |
| `manager` | Operación, reportes, productos, caja y anulaciones |
| `cashier` | POS, clientes, cobros, documentos y sesiones de caja |
| `waiter` | Productos en lectura, mesas y comandas; sin finanzas |
| `kitchen` | Solo KDS y pasos `pending → preparing → ready` |

Requisitos comunes: sesión autenticada por correo/contraseña o Google, correo confirmado, documento `users/{uid}` activo y rol reconocido. Iniciar con Google no crea permisos automáticamente: el propietario debe asignar el perfil antes del primer acceso operativo.

Las cuentas no se crean con contraseñas compartidas. El administrador registra cada identidad con su correo real y asigna el perfil correspondiente. Quien use correo/contraseña recibe recuperación de contraseña; quien use Google elige la misma dirección autorizada desde la pantalla de acceso. Un usuario no puede cambiar su propio perfil ni sus roles desde el cliente.
