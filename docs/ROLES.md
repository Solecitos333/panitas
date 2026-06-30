# Roles y permisos

| Rol | Acceso |
|---|---|
| `owner` | Configuración, usuarios y acceso completo |
| `manager` | Operación, reportes, productos, caja y anulaciones |
| `cashier` | POS, clientes, cobros, documentos y sesiones de caja |
| `waiter` | Productos en lectura, mesas y comandas; sin finanzas |
| `kitchen` | Solo KDS y pasos `pending → preparing → ready` |

Requisitos comunes: sesión autenticada, correo confirmado, documento `users/{uid}` activo y rol reconocido.

Las cuentas no se crean con contraseñas compartidas. El administrador crea cada identidad con su correo real, asigna el perfil correspondiente y envía recuperación de contraseña. Un usuario no puede cambiar su propio perfil ni sus roles desde el cliente.
