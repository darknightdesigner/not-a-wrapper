"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import {
  buildCreateShippingAddressPayload,
  buildUpdateShippingAddressPayload,
  normalizeFormValue,
  type ShippingAddressFormData,
} from "@/lib/shipping-addresses/payload"
import { cn } from "@/lib/utils"
import { useUser } from "@/lib/user-store/provider"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons-pro/core-stroke-rounded"
import { useMutation, useQuery } from "convex/react"
import { useId, useState } from "react"

const POSTAL_CODE_REGEX = /^\d{5}(-\d{4})?$/
const MAX_LABEL_LENGTH = 50

const US_STATES = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
] as const
// TODO: Replace with international regions when adding country support.
type ShippingAddressDoc = Doc<"shippingAddresses">

const EMPTY_FORM: ShippingAddressFormData = {
  label: "",
  name: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
}

function validateForm(form: ShippingAddressFormData) {
  const label = normalizeFormValue(form.label)
  const name = normalizeFormValue(form.name)
  const line1 = normalizeFormValue(form.line1)
  const city = normalizeFormValue(form.city)
  const state = normalizeFormValue(form.state)
  const postalCode = normalizeFormValue(form.postalCode)

  if (!label) return "Label is required."
  if (label.length > MAX_LABEL_LENGTH) {
    return `Label must be ${MAX_LABEL_LENGTH} characters or fewer.`
  }
  if (!name) return "Recipient name is required."
  if (!line1) return "Address line 1 is required."
  if (!city) return "City is required."
  if (!state) return "State is required."
  if (!US_STATES.some((entry) => entry.value === state)) {
    return "Please select a valid US state."
  }
  if (!postalCode) return "ZIP code is required."
  if (!POSTAL_CODE_REGEX.test(postalCode)) {
    return "ZIP code must be 5 digits or ZIP+4 (e.g. 12345 or 12345-6789)."
  }
  return null
}

function formatAddressLine(address: ShippingAddressDoc) {
  const line2 = address.line2 ? `, ${address.line2}` : ""
  return `${address.line1}${line2}, ${address.city}, ${address.state} ${address.postalCode}`
}

function toFormData(address: ShippingAddressDoc): ShippingAddressFormData {
  return {
    label: address.label,
    name: address.name,
    line1: address.line1,
    line2: address.line2 ?? "",
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
  }
}

function StateCombobox({
  id,
  value,
  onValueChange,
  disabled,
}: {
  id: string
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selectedState = US_STATES.find((state) => state.value === value) ?? null

  const handleSelect = (stateCode: string) => {
    onValueChange(stateCode)
    setOpen(false)
  }

  return (
    <div className="w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className="w-full justify-between rounded-md font-normal"
            />
          }
        >
          <span className={cn("truncate", !selectedState && "text-muted-foreground")}>
            {selectedState
              ? `${selectedState.label} (${selectedState.value})`
              : "Select state"}
          </span>
          <HugeiconsIcon icon={ArrowDown01Icon} size={16} className="opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-(--anchor-width) rounded-md p-0" align="start">
          <Command>
            <CommandInput placeholder="Search state..." />
            <CommandList>
              <CommandEmpty>No state found.</CommandEmpty>
              <CommandGroup>
                {US_STATES.map((entry) => {
                  const isSelected = value === entry.value
                  return (
                    <CommandItem
                      key={entry.value}
                      value={`${entry.label} ${entry.value}`}
                      onSelect={() => handleSelect(entry.value)}
                    >
                      <span className="flex-1">
                        {entry.label} ({entry.value})
                      </span>
                      {isSelected && <HugeiconsIcon icon={Tick02Icon} size={14} />}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function ShippingAddressForm({
  form,
  onFormChange,
  onCancel,
  onSubmit,
  isSubmitting,
  submitLabel,
}: {
  form: ShippingAddressFormData
  onFormChange: <K extends keyof ShippingAddressFormData>(
    key: K,
    value: ShippingAddressFormData[K]
  ) => void
  onCancel: () => void
  onSubmit: () => Promise<void>
  isSubmitting: boolean
  submitLabel: string
}) {
  const formId = useId()

  return (
    <Card className="py-1">
      <CardContent className="space-y-4 p-4">
        <form
          id={formId}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`${formId}-label`}>Label</Label>
            <Input
              id={`${formId}-label`}
              placeholder="Home"
              value={form.label}
              onChange={(event) => onFormChange("label", event.target.value)}
              disabled={isSubmitting}
              maxLength={MAX_LABEL_LENGTH}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-name`}>Recipient name</Label>
            <Input
              id={`${formId}-name`}
              placeholder="Jane Doe"
              value={form.name}
              onChange={(event) => onFormChange("name", event.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-line1`}>Address line 1</Label>
            <Input
              id={`${formId}-line1`}
              placeholder="123 Main St"
              value={form.line1}
              onChange={(event) => onFormChange("line1", event.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-line2`}>Address line 2 (optional)</Label>
            <Input
              id={`${formId}-line2`}
              placeholder="Apt 4B"
              value={form.line2}
              onChange={(event) => onFormChange("line2", event.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`${formId}-city`}>City</Label>
              <Input
                id={`${formId}-city`}
                placeholder="New York"
                value={form.city}
                onChange={(event) => onFormChange("city", event.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${formId}-state`}>State</Label>
              <StateCombobox
                id={`${formId}-state`}
                value={form.state}
                onValueChange={(value) => onFormChange("state", value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-postalCode`}>ZIP code</Label>
              <Input
                id={`${formId}-postalCode`}
                placeholder="12345"
                value={form.postalCode}
                onChange={(event) =>
                  onFormChange("postalCode", event.target.value)
                }
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${formId}-country`}>Country</Label>
              <Tooltip>
                <TooltipTrigger render={<div className="w-full cursor-not-allowed" />}>
                  <Input id={`${formId}-country`} value="United States" disabled />
                </TooltipTrigger>
                <TooltipContent>United States only for now.</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </form>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : submitLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function ShippingAddresses() {
  const addresses = useQuery(api.shippingAddresses.list) ?? []
  const createAddress = useMutation(api.shippingAddresses.create)
  const updateAddress = useMutation(api.shippingAddresses.update)
  const removeAddress = useMutation(api.shippingAddresses.remove)
  const setDefaultAddress = useMutation(api.shippingAddresses.setDefault)
  const { user } = useUser()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ShippingAddressFormData>(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [addressToDelete, setAddressToDelete] = useState<ShippingAddressDoc | null>(
    null
  )
  const [isDeleting, setIsDeleting] = useState(false)
  const [pendingDefaultId, setPendingDefaultId] = useState<string | null>(null)

  const editingAddress =
    editingId && editingId !== "new"
      ? addresses.find((address) => address._id === editingId) ?? null
      : null

  const startAdd = () => {
    setEditingId("new")
    setForm({
      ...EMPTY_FORM,
      name: user?.display_name ?? "",
    })
  }

  const startEdit = (address: ShippingAddressDoc) => {
    setEditingId(address._id)
    setForm(toFormData(address))
  }

  const resetEditor = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const handleChangeForm = <K extends keyof ShippingAddressFormData>(
    key: K,
    value: ShippingAddressFormData[K]
  ) => {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  const handleSave = async () => {
    const validationError = validateForm(form)
    if (validationError) {
      toast({ title: validationError, status: "error" })
      return
    }

    setIsSaving(true)
    try {
      if (editingId === "new") {
        const payload = buildCreateShippingAddressPayload(form)
        await createAddress({
          ...payload,
          isDefault: addresses.length === 0,
        })
        toast({
          title: "Address added",
          description: `${payload.label} has been saved.`,
        })
      } else if (editingAddress) {
        const payload = buildUpdateShippingAddressPayload(form)
        await updateAddress({
          addressId: editingAddress._id as Id<"shippingAddresses">,
          ...payload,
        })
        toast({
          title: "Address updated",
          description: `${payload.label} has been updated.`,
        })
      }

      resetEditor()
    } catch (error) {
      console.error("Failed to save shipping address:", error)
      toast({ title: "Failed to save address", status: "error" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteClick = (address: ShippingAddressDoc) => {
    setAddressToDelete(address)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!addressToDelete) return

    setIsDeleting(true)
    try {
      await removeAddress({ addressId: addressToDelete._id })
      toast({
        title: "Address deleted",
        description: `${addressToDelete.label} has been removed.`,
      })

      if (editingId === addressToDelete._id) {
        resetEditor()
      }
    } catch (error) {
      console.error("Failed to delete shipping address:", error)
      toast({ title: "Failed to delete address", status: "error" })
    } finally {
      setDeleteDialogOpen(false)
      setAddressToDelete(null)
      setIsDeleting(false)
    }
  }

  const handleSetDefault = async (addressId: Id<"shippingAddresses">) => {
    setPendingDefaultId(addressId)
    try {
      await setDefaultAddress({ addressId })
      toast({ title: "Default address updated" })
    } catch (error) {
      console.error("Failed to set default address:", error)
      toast({ title: "Failed to update default address", status: "error" })
    } finally {
      setPendingDefaultId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-balance">Shipping addresses</h3>
          <p className="text-muted-foreground mt-1 text-xs text-pretty">
            Manage where physical purchases should be delivered.
          </p>
        </div>
        {editingId !== "new" && (
          <Button variant="outline" size="sm" onClick={startAdd}>
            Add address
          </Button>
        )}
      </div>

      {editingId === "new" && (
        <ShippingAddressForm
          form={form}
          onFormChange={handleChangeForm}
          onCancel={resetEditor}
          onSubmit={handleSave}
          isSubmitting={isSaving}
          submitLabel="Save address"
        />
      )}

      {addresses.length > 0 && (
        <div className="space-y-3">
          {addresses.map((address) => {
            const isEditing = editingId === address._id
            const isSettingDefault = pendingDefaultId === address._id

            return (
              <div key={address._id} className="space-y-3">
                {!isEditing && (
                  <Card className="py-0">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <h4 className="truncate font-medium text-balance">
                              {address.label}
                            </h4>
                            {address.isDefault && (
                              <Badge variant="secondary" className="text-xs">
                                Default
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm">{address.name}</p>
                          <p className="text-muted-foreground mt-1 text-sm">
                            {formatAddressLine(address)}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {!address.isDefault && addresses.length > 1 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleSetDefault(
                                  address._id as Id<"shippingAddresses">
                                )
                              }
                              disabled={isSettingDefault}
                            >
                              {isSettingDefault ? "Updating..." : "Set as default"}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(address)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(address)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isEditing && (
                  <ShippingAddressForm
                    form={form}
                    onFormChange={handleChangeForm}
                    onCancel={resetEditor}
                    onSubmit={handleSave}
                    isSubmitting={isSaving}
                    submitLabel="Update address"
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shipping address</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{addressToDelete?.label}
              &quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDelete()}>
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
