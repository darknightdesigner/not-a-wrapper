"use client"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"

export function DrawerDirectionDemo() {
  return (
    <Drawer direction="right">
      <DrawerTrigger render={<Button variant="outline" />}>
        Open from right
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Right drawer</DrawerTitle>
          <DrawerDescription>
            Side drawers skip the drag handle and behave like a sheet with
            drag-to-dismiss.
          </DrawerDescription>
        </DrawerHeader>
      </DrawerContent>
    </Drawer>
  )
}
