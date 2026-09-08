/**
 * Dominio de Inventario, Mermas y Ajustes para Cafetería
 * Los Panitas by Nechy
 */

export const INVENTORY_OPERATIONS = Object.freeze(['count', 'waste', 'prep', 'restock', 'adjustment']);

export const INVENTORY_REASONS = Object.freeze({
  waste_unsold: {
    id: 'waste_unsold',
    label: 'Sobrante del día (No vendido)',
    shortLabel: 'Sobrante no vendido',
    icon: 'moon',
    defaultOp: 'waste',
    isWaste: true,
    description: 'Comida preparada que sobró al cierre de la jornada y no se conservará.'
  },
  waste_expired: {
    id: 'waste_expired',
    label: 'Caducó / Venció',
    shortLabel: 'Caducado',
    icon: 'calendar-x',
    defaultOp: 'waste',
    isWaste: true,
    description: 'Producto o ingrediente perecedero que superó su fecha límite de consumo.'
  },
  waste_damaged: {
    id: 'waste_damaged',
    label: 'Se estropeó / Botado / Accidente',
    shortLabel: 'Dañado / Botado',
    icon: 'trash-2',
    defaultOp: 'waste',
    isWaste: true,
    description: 'Comida que se cayó, se quemó o sufrió desperfecto en manipulación.'
  },
  production_demand: {
    id: 'production_demand',
    label: 'Preparación extra (Alta demanda)',
    shortLabel: 'Cocinado extra',
    icon: 'flame',
    defaultOp: 'prep',
    isWaste: false,
    description: 'Lote adicional cocinado o preparado en cocina para atender la demanda del día.'
  },
  restock: {
    id: 'restock',
    label: 'Compra / Reabastecimiento',
    shortLabel: 'Compra / Surtido',
    icon: 'truck',
    defaultOp: 'restock',
    isWaste: false,
    description: 'Mercancía, bebidas o insumos adquiridos e ingresados al almacén/mostrador.'
  },
  audit_count: {
    id: 'audit_count',
    label: 'Conteo físico de vitrina / Cuadre',
    shortLabel: 'Conteo físico',
    icon: 'clipboard-check',
    defaultOp: 'count',
    isWaste: false,
    description: 'Ajuste por conteo real de existencias físicas en mostrador o nevera.'
  }
});

export function getInventoryReason(reasonId) {
  return INVENTORY_REASONS[reasonId] || {
    id: String(reasonId || 'audit_count'),
    label: String(reasonId || 'Ajuste general'),
    shortLabel: 'Ajuste',
    icon: 'clipboard-pen',
    defaultOp: 'count',
    isWaste: false
  };
}

/**
 * Calcula el costo financiero de la pérdida o merma
 * @param {number} costCents Costo unitario registrado (o precio si no hay costo)
 * @param {number} priceCents Precio de venta de referencia
 * @param {number} quantity Cantidad de unidades mermadas
 * @returns {number} Costo total en centavos
 */
export function calculateWasteCostCents(costCents, priceCents, quantity) {
  const q = Math.max(0, Number(quantity || 0));
  const unitCost = Number(costCents) > 0 ? Number(costCents) : (Number(priceCents) > 0 ? Number(priceCents) : 0);
  return Math.round(unitCost * q);
}

/**
 * Valida un ajuste de inventario
 */
export function validateInventoryAdjustment({ currentStock, targetStock, quantity, operation }) {
  const cur = Math.max(0, Math.round(Number(currentStock || 0) * 1000) / 1000);
  
  if (operation === 'waste') {
    const q = Math.round(Number(quantity || 0) * 1000) / 1000;
    if (q <= 0) throw new Error('Indica la cantidad de unidades mermadas o descartadas.');
    if (q > cur) throw new Error('No puedes descartar ' + q + ' unidades porque la existencia actual es de ' + cur + '.');
    const resulting = Math.round((cur - q) * 1000) / 1000;
    return { delta: -q, resultingStock: resulting, quantity: q, type: 'decrease' };
  }

  if (operation === 'prep' || operation === 'restock') {
    const q = Math.round(Number(quantity || 0) * 1000) / 1000;
    if (q <= 0) throw new Error('Indica la cantidad de unidades preparadas o recibidas.');
    const resulting = Math.round((cur + q) * 1000) / 1000;
    return { delta: q, resultingStock: resulting, quantity: q, type: 'increase' };
  }

  // count / adjustment
  const target = Math.round(Number(targetStock || 0) * 1000) / 1000;
  if (!Number.isFinite(target) || target < 0) throw new Error('Indica una existencia final válida (igual o mayor a 0).');
  const delta = Math.round((target - cur) * 1000) / 1000;
  if (delta === 0) throw new Error('La existencia indicada coincide exactamente con la registrada en el sistema.');
  return {
    delta,
    resultingStock: target,
    quantity: Math.abs(delta),
    type: delta > 0 ? 'increase' : 'decrease'
  };
}
