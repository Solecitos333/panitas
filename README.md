# Los Panitas by Nechy

Sistema independiente de punto de venta, comandas, cocina, caja y facturación para **Los Panitas by Nechy**. No comparte código, autenticación, Firestore, inventario ni despliegue con Futunet o Creaticos.

## Módulos

- Panel operativo y reportes.
- Punto de venta con importes guardados en centavos enteros.
- Mesas, comandas y Kitchen Display System en tiempo real.
- Facturas, cotizaciones, proformas, cobros y NCF.
- Productos, inventario propio y clientes.
- Apertura, arqueo y cierre de caja.
- Impresión y exportaciones CSV/DGII 607.
- Roles, auditoría, modo desconectado y estados de error.

## Desarrollo local

Requiere Node.js 22 o posterior y Java 21 para las pruebas de reglas.

```bash
npm install
npm run dev
```

Mientras se desarrolla, se puede revisar cada experiencia sin crear cuentas reales:

- `http://localhost:4173/?role=owner`
- `http://localhost:4173/?role=manager`
- `http://localhost:4173/?role=cashier`
- `http://localhost:4173/?role=waiter`
- `http://localhost:4173/?role=kitchen`

El simulador local empieza limpio: doce mesas, sin productos, clientes ni ventas ficticias.

## Validación

```bash
npm test
npm run test:emulator
npm run validate
```

## Documentación

- [Arquitectura](docs/ARQUITECTURA.md)
- [Modelo de datos](docs/MODELO-DE-DATOS.md)
- [Roles](docs/ROLES.md)
- [Despliegue](docs/DESPLIEGUE.md)
- [Operación diaria](docs/OPERACION-DIARIA.md)
- [Recuperación](docs/RECUPERACION.md)
- [Pruebas de aceptación](docs/ACEPTACION.md)
- [Política de seguridad](SECURITY.md)

## Propiedad

Repositorio público para evaluación del dueño. El código es visible, pero no se concede una licencia de uso, copia, modificación o redistribución. Consulta [NOTICE](NOTICE).
