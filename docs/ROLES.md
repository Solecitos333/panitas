# Roles y permisos

| Rol | Acceso |
|---|---|
| `owner` | Configuración, usuarios y acceso completo |
| `manager` | Operación, reportes, productos, caja y anulaciones |
| `cashier` | POS, clientes, cobros, documentos y sesiones de caja |
| `waiter` | Productos en lectura, mesas y comandas; sin finanzas |
| `kitchen` | Solo KDS y pasos `pending → preparing → ready` |

Requisitos comunes: sesión autenticada con nombre de usuario y contraseña, documento `users/{uid}` activo y rol reconocido. Firebase usa internamente un identificador sintético que nunca se muestra ni corresponde a un correo personal.

El propietario crea cada identidad desde **Usuarios**, asigna el rol y define una contraseña inicial. La persona debe cambiarla desde su propia sesión para que nadie más la conozca. Las contraseñas son procesadas por Firebase Authentication y nunca se almacenan en Firestore.

Un usuario no puede modificar su perfil, rol ni estado. El propietario puede administrar a los demás, pero su propia cuenta está protegida contra desactivación o degradación accidental desde el cliente.
