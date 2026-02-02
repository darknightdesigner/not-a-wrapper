# Icon Mapping: Phosphor → HugeIcons

> **Status**: Reference Document for Migration
> **Date**: 2026-02-01
> **Package**: `@hugeicons-pro/core-stroke-rounded` v3.1.0

---

## Usage Pattern Change

**Before (Phosphor):**
```typescript
import { Check, CaretDown } from "@phosphor-icons/react"

<Check className="size-4" />
<CaretDown size={16} />
```

**After (HugeIcons):**
```typescript
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon, ArrowDown01Icon } from "@hugeicons-pro/core-stroke-rounded"

<HugeiconsIcon icon={Tick02Icon} size={16} className="size-4" />
<HugeiconsIcon icon={ArrowDown01Icon} size={16} />
```

---

## Complete Icon Mapping

### Navigation & Arrows

| Phosphor | HugeIcons | Notes |
|----------|-----------|-------|
| `ArrowLeft` | `ArrowLeft01Icon` | |
| `ArrowRight` | `ArrowRight01Icon` | |
| `ArrowUp` | `ArrowUp01Icon` | |
| `ArrowUpRight` | `ArrowUpRight01Icon` | |
| `ArrowClockwise` | `RefreshIcon` | Refresh/reload action |
| `CaretDown` | `ArrowDown01Icon` | Chevron/caret style |
| `CaretUp` | `ArrowUp01Icon` | |
| `CaretLeft` | `ArrowLeft01Icon` | |
| `CaretRight` | `ArrowRight01Icon` | |
| `CaretUpDown` | `ArrowUpDownIcon` | Select indicator |

### Actions & Status

| Phosphor | HugeIcons | Notes |
|----------|-----------|-------|
| `Check` | `Tick02Icon` | Checkmark |
| `CheckCircle` | `CheckmarkCircle01Icon` | Success indicator |
| `X` | `Cancel01Icon` | Close/dismiss |
| `Plus` | `Add01Icon` | Add action |
| `Minus` | `MinusSignIcon` | Remove/subtract |
| `Copy` | `Copy01Icon` | Copy to clipboard |
| `Trash` | `Delete01Icon` | Delete action |
| `TrashSimple` | `Delete01Icon` | Same as Trash |
| `PencilSimple` | `PencilEdit01Icon` | Edit action |
| `Stop` | `StopCircleIcon` | Stop action |

### Feedback & Status

| Phosphor | HugeIcons | Notes |
|----------|-----------|-------|
| `Info` | `InformationCircleIcon` | Info message |
| `Warning` | `Alert01Icon` | Warning triangle |
| `WarningCircle` | `AlertCircleIcon` | Warning in circle |
| `Question` | `HelpCircleIcon` | Help/question |
| `QuestionMark` | `HelpCircleIcon` | Same as Question |
| `ThumbsUp` | `ThumbsUpIcon` | Positive feedback |
| `ThumbsDown` | `ThumbsDownIcon` | Negative feedback |
| `SealCheck` | `CheckmarkBadge01Icon` | Verified/seal |

### Loading & Spinners

| Phosphor | HugeIcons | Notes |
|----------|-----------|-------|
| `Spinner` | `Loading01Icon` | Loading spinner |
| `SpinnerGap` | `Loading01Icon` | Animated spinner |

### UI Elements

| Phosphor | HugeIcons | Notes |
|----------|-----------|-------|
| `Circle` | `CircleIcon` | Radio button indicator |
| `DotsThree` | `MoreVerticalIcon` | Vertical menu dots |
| `DotsThreeOutline` | `MoreHorizontalIcon` | Horizontal menu dots |
| `MagnifyingGlass` | `Search01Icon` | Search |
| `ListMagnifyingGlass` | `SearchList01Icon` | Search in list |
| `Globe` | `GlobeIcon` | Web/public |
| `Link` | `Link01Icon` | URL/link |
| `SidebarSimple` | `SidebarLeftIcon` | Sidebar toggle |

### Files & Folders

| Phosphor | HugeIcons | Notes |
|----------|-----------|-------|
| `Folder` | `Folder01Icon` | Folder |
| `FolderPlus` | `FolderAddIcon` | New folder |
| `FileArrowUp` | `FileUploadIcon` | File upload |
| `Paperclip` | `AttachmentIcon` | Attachment |

### Communication

| Phosphor | HugeIcons | Notes |
|----------|-----------|-------|
| `ChatCircle` | `Chat01Icon` | Chat bubble |
| `Quotes` | `QuoteUpIcon` | Quote/citation |

### User & Account

| Phosphor | HugeIcons | Notes |
|----------|-----------|-------|
| `User` | `User02Icon` | User profile |
| `SignOut` | `Logout01Icon` | Sign out/logout |
| `Key` | `Key01Icon` | API key/password |

### Other

| Phosphor | HugeIcons | Notes |
|----------|-----------|-------|
| `Wallet` | `Wallet01Icon` | Wallet/payment |
| `NotePencil` | `NoteEditIcon` | Edit note |
| `PlugsConnected` | `Plug01Icon` | Connections |

---

## Former Lucide Exceptions (Now HugeIcons)

These icons were kept in `lib/icons/extras.ts` from Lucide. HugeIcons has equivalents:

| Lucide | HugeIcons | Notes |
|--------|-----------|-------|
| `Pin` | `Pin02Icon` | Pin/bookmark |
| `PinOff` | `PinOffIcon` | Unpin |
| `PanelLeft` | `SidebarLeftIcon` | Sidebar panel |
| `GripVertical` | `DragDropVerticalIcon` | Drag handle |

---

## Import Cheatsheet

```typescript
// Common imports
import { HugeiconsIcon } from "@hugeicons/react"
import {
  // Navigation
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  ArrowUpDownIcon,
  RefreshIcon,
  
  // Actions
  Tick02Icon,
  Cancel01Icon,
  Add01Icon,
  MinusSignIcon,
  Copy01Icon,
  Delete01Icon,
  PencilEdit01Icon,
  StopCircleIcon,
  
  // Status
  InformationCircleIcon,
  Alert01Icon,
  AlertCircleIcon,
  HelpCircleIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  CheckmarkBadge01Icon,
  CheckmarkCircle01Icon,
  
  // Loading
  Loading01Icon,
  
  // UI
  CircleIcon,
  MoreVerticalIcon,
  MoreHorizontalIcon,
  Search01Icon,
  SearchList01Icon,
  GlobeIcon,
  Link01Icon,
  SidebarLeftIcon,
  
  // Files
  Folder01Icon,
  FolderAddIcon,
  FileUploadIcon,
  AttachmentIcon,
  
  // Communication
  Chat01Icon,
  QuoteUpIcon,
  
  // User
  User02Icon,
  Logout01Icon,
  Key01Icon,
  
  // Other
  Wallet01Icon,
  NoteEditIcon,
  Plug01Icon,
  Pin02Icon,
  PinOffIcon,
  DragDropVerticalIcon,
} from "@hugeicons-pro/core-stroke-rounded"
```

---

## Migration Notes

1. **Size prop**: HugeIcons uses `size` prop on `HugeiconsIcon`, not on the icon itself
2. **Color**: Use `color` prop or inherit from parent via `currentColor`
3. **className**: Applied to the wrapper `HugeiconsIcon` component
4. **strokeWidth**: Adjustable via `strokeWidth` prop (default 1.5)

---

*Reference document for Phosphor → HugeIcons migration.*
