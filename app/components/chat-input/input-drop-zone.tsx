import {
  FileUpload,
  FileUploadContent,
} from "@/components/ui/file-upload"
import { ACCEPTED_FILE_PICKER_TYPES } from "@/lib/file-handling"
import { HugeiconsIcon } from "@hugeicons/react"
import { FileUploadIcon } from "@hugeicons-pro/core-stroke-rounded"

type InputDropZoneProps = {
  onFileUpload: (files: File[]) => void
  disabled?: boolean
  children: React.ReactNode
}

/**
 * Shared drag-and-drop file upload zone for chat inputs.
 * Wraps prompt content with a FileUpload provider and standard drop overlay.
 */
export function InputDropZone({
  onFileUpload,
  disabled,
  children,
}: InputDropZoneProps) {
  return (
    <FileUpload
      onFilesAdded={onFileUpload}
      multiple
      accept={ACCEPTED_FILE_PICKER_TYPES}
      disabled={disabled}
    >
      {children}
      <FileUploadContent>
        <div className="border-input bg-background flex flex-col items-center rounded-lg border border-dashed p-8">
          <HugeiconsIcon
            icon={FileUploadIcon}
            size={32}
            className="text-muted-foreground"
          />
          <span className="mt-4 mb-1 text-lg font-medium">
            Drop files here
          </span>
          <span className="text-muted-foreground text-sm">
            Drop files here to add them to the conversation
          </span>
        </div>
      </FileUploadContent>
    </FileUpload>
  )
}
