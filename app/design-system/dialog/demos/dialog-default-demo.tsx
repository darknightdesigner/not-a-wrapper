"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from "@/components/ui/dialog"

export function DialogDefaultDemo() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        Edit profile
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader
          title="Edit profile"
          description="Make changes to your profile here. Click save when you are done."
        />
        <DialogFooter
          secondaryButton={
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
          }
          primaryButton={
            <DialogClose render={<Button />}>Save changes</DialogClose>
          }
        />
      </DialogContent>
    </Dialog>
  )
}
