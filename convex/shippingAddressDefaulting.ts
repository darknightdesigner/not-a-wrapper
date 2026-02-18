type DefaultableAddress = {
  isDefault: boolean
}

export function shouldNewAddressBeDefault(
  existingAddresses: readonly DefaultableAddress[],
  requestedIsDefault: boolean | undefined
) {
  const hasExistingDefault = existingAddresses.some((address) => address.isDefault)
  return requestedIsDefault === true || !hasExistingDefault
}
