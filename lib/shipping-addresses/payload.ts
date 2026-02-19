export type ShippingAddressFormData = {
  label: string
  name: string
  email: string
  phone: string
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
}

type ShippingAddressBasePayload = {
  label: string
  name: string
  email: string
  phone: string
  line1: string
  city: string
  state: string
  postalCode: string
  country: "US"
}

export type CreateShippingAddressPayload = ShippingAddressBasePayload & {
  line2?: string
}

export type UpdateShippingAddressPayload = Omit<
  ShippingAddressBasePayload,
  "email" | "phone"
> & {
  line2: string | null
  email: string | null
  phone: string | null
}

export function normalizeFormValue(value: string) {
  return value.trim()
}

function buildBasePayload(form: ShippingAddressFormData): ShippingAddressBasePayload {
  return {
    label: normalizeFormValue(form.label),
    name: normalizeFormValue(form.name),
    email: normalizeFormValue(form.email),
    phone: normalizeFormValue(form.phone),
    line1: normalizeFormValue(form.line1),
    city: normalizeFormValue(form.city),
    state: normalizeFormValue(form.state),
    postalCode: normalizeFormValue(form.postalCode),
    country: "US",
  }
}

export function buildCreateShippingAddressPayload(
  form: ShippingAddressFormData
): CreateShippingAddressPayload {
  const line2 = normalizeFormValue(form.line2)
  return {
    ...buildBasePayload(form),
    line2: line2 || undefined,
  }
}

export function buildUpdateShippingAddressPayload(
  form: ShippingAddressFormData
): UpdateShippingAddressPayload {
  const line2 = normalizeFormValue(form.line2)
  const email = normalizeFormValue(form.email)
  const phone = normalizeFormValue(form.phone)
  return {
    ...buildBasePayload(form),
    // Tri-state PATCH contract: null means explicit clear.
    line2: line2 || null,
    email: email || null,
    phone: phone || null,
  }
}
