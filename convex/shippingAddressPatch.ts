import type { Doc } from "./_generated/dataModel"

export type ShippingAddressUpdateInput = {
  label?: string
  name?: string
  email?: string | null
  phone?: string | null
  line1?: string
  line2?: string | null
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export function buildShippingAddressPatch(
  updates: ShippingAddressUpdateInput
): Partial<Doc<"shippingAddresses">> {
  const patch: Partial<Doc<"shippingAddresses">> = {}

  if (updates.label !== undefined) patch.label = updates.label
  if (updates.name !== undefined) patch.name = updates.name
  if (updates.line1 !== undefined) patch.line1 = updates.line1

  if (updates.line2 === null) {
    patch.line2 = undefined
  } else if (updates.line2 !== undefined) {
    patch.line2 = updates.line2
  }

  if (updates.email === null) {
    patch.email = undefined
  } else if (updates.email !== undefined) {
    patch.email = updates.email
  }

  if (updates.phone === null) {
    patch.phone = undefined
  } else if (updates.phone !== undefined) {
    patch.phone = updates.phone
  }

  if (updates.city !== undefined) patch.city = updates.city
  if (updates.state !== undefined) patch.state = updates.state
  if (updates.postalCode !== undefined) patch.postalCode = updates.postalCode
  if (updates.country !== undefined) patch.country = updates.country

  return patch
}
