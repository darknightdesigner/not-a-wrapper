---
name: base-ui-forms
description: Guide to building forms with Base UI components. Use when creating forms with Field, Form, Fieldset, Select, Combobox, Autocomplete, NumberField, Slider, Switch, Checkbox, or Radio components, when integrating Base UI forms with React Hook Form or TanStack Form, when implementing constraint validation or custom validation, or when handling form submission and server-side error display.
---

# Base UI Forms

A guide to building forms with Base UI components.

Base UI form control components extend the native [constraint validation API](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#the-constraint-validation-api) so you can build forms for collecting user input or providing control over an interface. They also integrate seamlessly with third-party libraries like React Hook Form and TanStack Form.

> **Official docs**: <https://base-ui.com/react/overview/quick-start>
> For additional references, component API details, and LLM-friendly markdown, see the official Base UI documentation.

## Form Components Overview

Base UI provides the following form-related components:

| Component | Import | Purpose |
|-----------|--------|---------|
| `Form` | `@base-ui/react/form` | Form wrapper with `onFormSubmit` convenience |
| `Field` | `@base-ui/react/field` | Field wrapper with label, description, error, and validation |
| `Fieldset` | `@base-ui/react/fieldset` | Groups multiple inputs (checkbox groups, radio groups, range sliders) |
| `Select` | `@base-ui/react/select` | Dropdown select |
| `Combobox` | `@base-ui/react/combobox` | Filterable select with text input |
| `Autocomplete` | `@base-ui/react/autocomplete` | Text input with suggestions |
| `NumberField` | `@base-ui/react/number-field` | Numeric input with increment/decrement |
| `Slider` | `@base-ui/react/slider` | Range slider (single or multi-thumb) |
| `Switch` | `@base-ui/react/switch` | Toggle switch |
| `Checkbox` | `@base-ui/react/checkbox` | Checkbox (standalone or in groups) |
| `CheckboxGroup` | `@base-ui/react/checkbox-group` | Groups multiple checkboxes |
| `Radio` | `@base-ui/react/radio` | Radio button |
| `RadioGroup` | `@base-ui/react/radio-group` | Groups radio buttons |

## Naming Form Controls

Form controls must have an accessible name to be recognized by assistive technologies. `<Field.Label>` and `<Field.Description>` automatically assign the accessible name and description to their associated control.

### Labeling Select and Slider

```tsx
import { Form } from '@base-ui/react/form';
import { Field } from '@base-ui/react/field';
import { Select } from '@base-ui/react/select';
import { Slider } from '@base-ui/react/slider';

<Form>
  <Field.Root>
    <Field.Label>Time zone</Field.Label>
    <Field.Description>Used for notifications and reminders</Field.Description>
    <Select.Root />
  </Field.Root>

  <Field.Root>
    <Field.Label>Zoom level</Field.Label>
    <Field.Description>Adjust the size of the user interface</Field.Description>
    <Slider.Root />
  </Field.Root>
</Form>;
```

### Implicitly Labeling Switch, Checkbox, and Radio

Enclose the component with `<Field.Label>`:

```tsx
import { Field } from '@base-ui/react/field';
import { Switch } from '@base-ui/react/switch';

<Field.Root>
  <Field.Label>
    <Switch.Root />
    Developer mode
  </Field.Label>
  <Field.Description>Enables extra tools for web developers</Field.Description>
</Field.Root>;
```

### Fieldset for Multi-Input Components

Compose `<Fieldset>` with components containing multiple `<input>` elements (`CheckboxGroup`, `RadioGroup`, range `Slider`) and use `<Fieldset.Legend>` to label the group:

```tsx
import { Form } from '@base-ui/react/form';
import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Slider } from '@base-ui/react/slider';

<Form>
  <Field.Root>
    <Fieldset.Root render={<Slider.Root />}>
      <Fieldset.Legend>Price range</Fieldset.Legend>
      <Slider.Control>
        <Slider.Track>
          <Slider.Thumb />
          <Slider.Thumb />
        </Slider.Track>
      </Slider.Control>
    </Fieldset.Root>
  </Field.Root>

  <Field.Root>
    <Fieldset.Root render={<RadioGroup />}>
      <Fieldset.Legend>Storage type</Fieldset.Legend>
      <Radio.Root value="ssd" />
      <Radio.Root value="hdd" />
    </Fieldset.Root>
  </Field.Root>
</Form>;
```

### Explicitly Labeling Items in Groups

Use `<Field.Item>` in checkbox or radio groups to individually label each control:

```tsx
import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import { Checkbox } from '@base-ui/react/checkbox';
import { CheckboxGroup } from '@base-ui/react/checkbox-group';

<Field.Root>
  <Fieldset.Root render={<CheckboxGroup />}>
    <Fieldset.Legend>Backup schedule</Fieldset.Legend>
    <Field.Item>
      <Checkbox.Root value="daily" />
      <Field.Label>Daily</Field.Label>
      <Field.Description>Daily at 00:00</Field.Description>
    </Field.Item>
    <Field.Item>
      <Checkbox.Root value="monthly" />
      <Field.Label>Monthly</Field.Label>
      <Field.Description>On the 5th of every month at 23:59</Field.Description>
    </Field.Item>
  </Fieldset.Root>
</Field.Root>;
```

## Building Form Fields

Pass the `name` prop to `<Field.Root>` to include the wrapped control's value when a parent form is submitted:

```tsx
import { Form } from '@base-ui/react/form';
import { Field } from '@base-ui/react/field';
import { Combobox } from '@base-ui/react/combobox';

<Form>
  <Field.Root name="country">
    <Field.Label>Country of residence</Field.Label>
    <Combobox.Root />
  </Field.Root>
</Form>;
```

## Submitting Data

### Native onSubmit

```tsx
import { Form } from '@base-ui/react/form';

<Form
  onSubmit={async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await fetch('https://api.example.com', {
      method: 'POST',
      body: formData,
    });
  }}
/>;
```

### Convenience onFormSubmit

When using `onFormSubmit`, you receive form values as a JavaScript object, and `preventDefault()` is automatically called:

```tsx
import { Form } from '@base-ui/react/form';

<Form
  onFormSubmit={async (formValues) => {
    const payload = {
      product_id: formValues.id,
      order_quantity: formValues.quantity,
    };
    await fetch('https://api.example.com', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }}
/>;
```

## Constraint Validation

Base UI form components support native HTML validation attributes:

| Attribute | Purpose |
|-----------|---------|
| `required` | Specifies a required field |
| `minLength` / `maxLength` | Valid length for text fields |
| `pattern` | Regular expression the value must match |
| `step` | Increment that numeric values must be a multiple of |

```tsx
import { Field } from '@base-ui/react/field';

<Field.Root name="website">
  <Field.Control type="url" required pattern="https?://.*" />
  <Field.Error />
</Field.Root>;
```

### Positioning Hidden Inputs

Base UI form components use a hidden input for native form submission and validation. To anchor the hidden input so the native validation bubble points correctly, wrap controls in a relatively positioned container:

```tsx
import { Field } from '@base-ui/react/field';
import { Select } from '@base-ui/react/select';

<Field.Root name="apple">
  <Field.Label>Apple</Field.Label>
  <div className="relative">
    <Select.Root />
  </div>
</Field.Root>;
```

## Custom Validation

Pass a synchronous or asynchronous validation function to the `validate` prop, which runs after native validations have passed.

Use the `validationMode` prop to configure when validation is performed:

| Mode | Behavior |
|------|----------|
| `onSubmit` (default) | Validates all fields on form submit; invalid fields revalidate on change |
| `onBlur` | Validates when focus moves away |
| `onChange` | Validates when value changes |

`validationDebounceTime` debounces the function for async requests or `onChange` text fields.

```tsx
import { Field } from '@base-ui/react/field';

<Field.Root
  name="username"
  validationMode="onChange"
  validationDebounceTime={300}
  validate={async (value) => {
    if (value === 'admin') {
      return 'Reserved for system use.';
    }

    const result = await fetch(/* check username availability */);

    if (!result) {
      return `${value} is unavailable.`;
    }

    return null;
  }}
>
  <Field.Control required minLength={3} />
  <Field.Error />
</Field.Root>;
```

## Server-Side Validation

Pass errors from server-side validation to the `errors` prop on `<Form>`. This should be an object with field names as keys and an error string or array of strings as the value. Once a field's value changes, any corresponding error is cleared.

```tsx
import { Form } from '@base-ui/react/form';
import { Field } from '@base-ui/react/field';

const [errors, setErrors] = React.useState();

<Form
  errors={errors}
  onSubmit={async (event) => {
    event.preventDefault();
    const response = await submitToServer(/* data */);
    setErrors(response.errors);
  }}
>
  <Field.Root name="promoCode" />
</Form>;
```

### Server Functions with useActionState

When using Server Functions with Form Actions, return server-side errors from `useActionState` to the `errors` prop:

```tsx
// app/form.tsx
'use client';
import { Form } from '@base-ui/react/form';
import { Field } from '@base-ui/react/field';
import { login } from './actions';

const [state, formAction, loading] = React.useActionState(login, {});

<Form action={formAction} errors={state.errors}>
  <Field.Root name="password">
    <Field.Control />
    <Field.Error />
  </Field.Root>
</Form>;
```

```tsx
// app/actions.ts
'use server';
export async function login(formData: FormData) {
  const result = authenticateUser(formData);

  if (!result.success) {
    return {
      errors: {
        password: 'Invalid username or password',
      },
    };
  }
}
```

## Displaying Errors

Use `<Field.Error>` without `children` to automatically display the native error message. The `match` prop customizes messages based on validity state:

```tsx
<Field.Error match="valueMissing">You must create a username</Field.Error>
```

## React Hook Form Integration

[React Hook Form](https://react-hook-form.com) integrates with Base UI to externally manage form and field state.

### Initialize the Form

```tsx
import { useForm } from 'react-hook-form';

const { control, handleSubmit } = useForm<FormValues>({
  defaultValues: {
    username: '',
    email: '',
  },
});
```

### Integrate Components with Controller

Use `<Controller>` to integrate with `<Field>`, forwarding `name`, `field`, and `fieldState` render props:

```tsx
import { useForm, Controller } from 'react-hook-form';
import { Field } from '@base-ui/react/field';

const { control, handleSubmit } = useForm({
  defaultValues: { username: '' },
});

<Controller
  name="username"
  control={control}
  render={({
    field: { name, ref, value, onBlur, onChange },
    fieldState: { invalid, isTouched, isDirty, error },
  }) => (
    <Field.Root name={name} invalid={invalid} touched={isTouched} dirty={isDirty}>
      <Field.Label>Username</Field.Label>
      <Field.Description>
        May appear where you contribute or are mentioned.
      </Field.Description>
      <Field.Control
        placeholder="e.g. alice132"
        value={value}
        onBlur={onBlur}
        onValueChange={onChange}
        ref={ref}
      />
      <Field.Error match={!!error}>{error?.message}</Field.Error>
    </Field.Root>
  )}
/>;
```

**Key detail**: For React Hook Form to focus invalid fields, ensure wrapping components forward the `ref` to the underlying Base UI component. Use the `inputRef` prop for components that don't directly render an input, or `ref` for components like `<NumberField.Input>`.

### Field Validation with Controller

Specify `rules` on `<Controller>` and use the `match` prop to delegate error rendering:

```tsx
<Controller
  name="username"
  control={control}
  rules={{
    required: 'This is a required field',
    minLength: { value: 2, message: 'Too short' },
    validate: (value) => {
      // custom validation logic
      return null;
    },
  }}
  render={({
    field: { name, ref, value, onBlur, onChange },
    fieldState: { invalid, isTouched, isDirty, error },
  }) => (
    <Field.Root name={name} invalid={invalid} touched={isTouched} dirty={isDirty}>
      <Field.Label>Username</Field.Label>
      <Field.Control
        placeholder="e.g. alice132"
        value={value}
        onBlur={onBlur}
        onValueChange={onChange}
        ref={ref}
      />
      <Field.Error match={!!error}>{error?.message}</Field.Error>
    </Field.Root>
  )}
/>
```

### Submitting Data with React Hook Form

Wrap your submit handler with `handleSubmit`:

```tsx
import { useForm } from 'react-hook-form';
import { Form } from '@base-ui/react/form';

interface FormValues {
  username: string;
  email: string;
}

const { handleSubmit } = useForm<FormValues>();

async function submitForm(data: FormValues) {
  await fetch(/* ... */);
}

<Form onSubmit={handleSubmit(submitForm)} />;
```

## TanStack Form Integration

[TanStack Form](https://tanstack.com/form/v1/docs/overview) provides a function-based API for orchestrating validations.

### Initialize the Form

```tsx
import { useForm } from '@tanstack/react-form';

interface FormValues {
  username: string;
  email: string;
}

const defaultValues: FormValues = {
  username: '',
  email: '',
};

const form = useForm<FormValues>({
  defaultValues,
});
```

### Integrate Components with form.Field

Use `<form.Field>` with the `children` prop to forward field render props to Base UI:

```tsx
import { useForm } from '@tanstack/react-form';
import { Field } from '@base-ui/react/field';

const form = useForm(/* config */);

<form>
  <form.Field
    name="username"
    children={(field) => (
      <Field.Root
        name={field.name}
        invalid={!field.state.meta.isValid}
        dirty={field.state.meta.isDirty}
        touched={field.state.meta.isTouched}
      >
        <Field.Label>Username</Field.Label>
        <Field.Control
          value={field.state.value}
          onValueChange={field.handleChange}
          onBlur={field.handleBlur}
          placeholder="e.g. bob276"
        />
        <Field.Error match={!field.state.meta.isValid}>
          {field.state.meta.errors.join(',')}
        </Field.Error>
      </Field.Root>
    )}
  />
</form>;
```

**Note**: The Base UI `<Form>` component is not needed when using TanStack Form.

### Form-Level Validation with TanStack

Use `revalidateLogic` for a native `<form>`-like validation strategy:

```tsx
import { useForm, revalidateLogic } from '@tanstack/react-form';

const form = useForm({
  defaultValues: {
    username: '',
    email: '',
  },
  validationLogic: revalidateLogic({
    mode: 'submit',
    modeAfterSubmission: 'change',
  }),
  validators: {
    onDynamic: ({ value: formValues }) => {
      const errors = {};

      if (!formValues.username) {
        errors.username = 'Username is required.';
      } else if (formValues.username.length < 3) {
        errors.username = 'At least 3 characters.';
      }

      if (!formValues.email) {
        errors.email = 'Email is required.';
      }

      return { form: errors, fields: errors };
    },
  },
});
```

### Field-Level Validation with TanStack

Pass additional validators to individual `<form.Field>` components:

```tsx
<form.Field
  name="username"
  validators={{
    onChangeAsync: async ({ value: username }) => {
      const result = await fetch(/* check username availability */);
      return result.success ? undefined : `${username} is not available.`;
    },
  }}
  children={(field) => (
    <Field.Root name={field.name} /* forward field props */ />
  )}
/>
```

### Submitting Data with TanStack Form

Pass a submit handler to `onSubmit` in `useForm`, then call `form.handleSubmit()`:

```tsx
import { useForm } from '@tanstack/react-form';

const form = useForm({
  onSubmit: async ({ value: formValues }) => {
    await fetch(/* POST formValues */);
  },
});

<form
  onSubmit={(event) => {
    event.preventDefault();
    form.handleSubmit();
  }}
>
  {/* form fields */}
  <button type="submit">Submit</button>
</form>;
```

## Styled Component Patterns (Tailwind CSS)

Below are reusable wrapper patterns for each form component, using Tailwind CSS with `clsx` for class merging. These follow the project convention of wrapping Base UI primitives in styled components.

### Form

```tsx
import clsx from 'clsx';
import { Form as BaseForm } from '@base-ui/react/form';

export function Form({ className, ...props }: BaseForm.Props) {
  return (
    <BaseForm
      className={clsx('flex w-full max-w-3xs sm:max-w-[20rem] flex-col gap-5', className)}
      {...props}
    />
  );
}
```

### Field

```tsx
import * as React from 'react';
import clsx from 'clsx';
import { Field } from '@base-ui/react/field';

export function Root({ className, ...props }: Field.Root.Props) {
  return <Field.Root className={clsx('flex flex-col items-start gap-1', className)} {...props} />;
}

export function Label({ className, ...props }: Field.Label.Props) {
  return (
    <Field.Label
      className={clsx(
        'text-sm font-medium text-gray-900 has-[[role="checkbox"]]:flex has-[[role="checkbox"]]:items-center has-[[role="checkbox"]]:gap-2 has-[[role="radio"]]:flex has-[[role="radio"]]:items-center has-[[role="radio"]]:gap-2 has-[[role="switch"]]:flex has-[[role="switch"]]:items-center has-[[role="radio"]]:font-normal',
        className,
      )}
      {...props}
    />
  );
}

export function Description({ className, ...props }: Field.Description.Props) {
  return <Field.Description className={clsx('text-sm text-gray-600', className)} {...props} />;
}

export const Control = React.forwardRef<HTMLInputElement, Field.Control.Props>(
  function FieldControl(
    { className, ...props }: Field.Control.Props,
    forwardedRef: React.ForwardedRef<HTMLInputElement>,
  ) {
    return (
      <Field.Control
        ref={forwardedRef}
        className={clsx(
          'h-10 w-full max-w-xs rounded-md bg-[canvas] border border-gray-200 pl-3.5 text-base text-gray-900 focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-blue-800',
          className,
        )}
        {...props}
      />
    );
  },
);

export function Error({ className, ...props }: Field.Error.Props) {
  return <Field.Error className={clsx('text-sm text-red-800', className)} {...props} />;
}

export function Item(props: Field.Item.Props) {
  return <Field.Item {...props} />;
}
```

### Fieldset

```tsx
import clsx from 'clsx';
import { Fieldset } from '@base-ui/react/fieldset';

export function Root(props: Fieldset.Root.Props) {
  return <Fieldset.Root {...props} />;
}

export function Legend({ className, ...props }: Fieldset.Legend.Props) {
  return (
    <Fieldset.Legend className={clsx('text-sm font-medium text-gray-900', className)} {...props} />
  );
}
```

### NumberField

```tsx
import * as React from 'react';
import clsx from 'clsx';
import { NumberField } from '@base-ui/react/number-field';

export function Root({ className, ...props }: NumberField.Root.Props) {
  return (
    <NumberField.Root className={clsx('flex flex-col items-start gap-1', className)} {...props} />
  );
}

export function Group({ className, ...props }: NumberField.Group.Props) {
  return <NumberField.Group className={clsx('flex', className)} {...props} />;
}

export function Decrement({ className, ...props }: NumberField.Decrement.Props) {
  return (
    <NumberField.Decrement
      className={clsx(
        'flex size-10 items-center justify-center rounded-tl-md rounded-bl-md border border-gray-200 bg-gray-50 bg-clip-padding text-gray-900 select-none hover:bg-gray-100 active:bg-gray-100',
        className,
      )}
      {...props}
    />
  );
}

export const Input = React.forwardRef<HTMLInputElement, NumberField.Input.Props>(function Input(
  { className, ...props }: NumberField.Input.Props,
  forwardedRef: React.ForwardedRef<HTMLInputElement>,
) {
  return (
    <NumberField.Input
      ref={forwardedRef}
      className={clsx(
        'h-10 w-24 border-t border-b border-gray-200 text-center text-base text-gray-900 tabular-nums focus:z-1 focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-blue-800',
        className,
      )}
      {...props}
    />
  );
});

export function Increment({ className, ...props }: NumberField.Increment.Props) {
  return (
    <NumberField.Increment
      className={clsx(
        'flex size-10 items-center justify-center rounded-tr-md rounded-br-md border border-gray-200 bg-gray-50 bg-clip-padding text-gray-900 select-none hover:bg-gray-100 active:bg-gray-100',
        className,
      )}
      {...props}
    />
  );
}
```

### Select

```tsx
import * as React from 'react';
import clsx from 'clsx';
import { Select } from '@base-ui/react/select';

export function Root(props: Select.Root.Props<any>) {
  return <Select.Root {...props} />;
}

export function Trigger({ className, ...props }: Select.Trigger.Props) {
  return (
    <Select.Trigger
      className={clsx(
        'flex h-10 min-w-36 items-center justify-between gap-3 rounded-md border border-gray-200 pr-3 pl-3.5 text-base text-gray-900 select-none hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-blue-800 data-[popup-open]:bg-gray-100 cursor-default not-[[data-filled]]:text-gray-500 bg-[canvas]',
        className,
      )}
      {...props}
    />
  );
}

export function Value({ className, ...props }: Select.Value.Props) {
  return <Select.Value className={clsx('', className)} {...props} />;
}

export function Icon({ className, ...props }: Select.Icon.Props) {
  return <Select.Icon className={clsx('flex', className)} {...props} />;
}

export function Portal(props: Select.Portal.Props) {
  return <Select.Portal {...props} />;
}

export function Positioner({ className, ...props }: Select.Positioner.Props) {
  return (
    <Select.Positioner
      className={clsx('outline-none select-none z-10', className)}
      sideOffset={8}
      {...props}
    />
  );
}

export function Popup({ className, ...props }: Select.Popup.Props) {
  return (
    <Select.Popup
      className={clsx(
        'group origin-[var(--transform-origin)] bg-clip-padding rounded-md bg-[canvas] text-gray-900 shadow-lg shadow-gray-200 outline outline-gray-200 transition-[transform,scale,opacity] data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[side=none]:data-[ending-style]:transition-none data-[starting-style]:scale-90 data-[starting-style]:opacity-0 data-[side=none]:data-[starting-style]:scale-100 data-[side=none]:data-[starting-style]:opacity-100 data-[side=none]:data-[starting-style]:transition-none dark:shadow-none dark:outline-gray-300',
        className,
      )}
      {...props}
    />
  );
}

export function ScrollUpArrow({ className, ...props }: Select.ScrollUpArrow.Props) {
  return (
    <Select.ScrollUpArrow
      className={clsx(
        "top-0 z-[1] flex h-4 w-full cursor-default items-center justify-center rounded-md bg-[canvas] text-center text-xs before:absolute data-[side=none]:before:top-[-100%] before:left-0 before:h-full before:w-full before:content-['']",
        className,
      )}
      {...props}
    />
  );
}

export function ScrollDownArrow({ className, ...props }: Select.ScrollDownArrow.Props) {
  return (
    <Select.ScrollDownArrow
      className={clsx(
        "bottom-0 z-[1] flex h-4 w-full cursor-default items-center justify-center rounded-md bg-[canvas] text-center text-xs before:absolute before:left-0 before:h-full before:w-full before:content-[''] data-[side=none]:before:bottom-[-100%]",
        className,
      )}
      {...props}
    />
  );
}

export function List({ className, ...props }: Select.List.Props) {
  return (
    <Select.List
      className={clsx(
        'relative py-1 scroll-py-6 overflow-y-auto max-h-[var(--available-height)]',
        className,
      )}
      {...props}
    />
  );
}

export function Item({ className, ...props }: Select.Item.Props) {
  return (
    <Select.Item
      className={clsx(
        'grid min-w-[var(--anchor-width)] cursor-default grid-cols-[0.75rem_1fr] items-center gap-3 py-2 pr-4 pl-2.5 text-sm leading-4 outline-none select-none group-data-[side=none]:min-w-[calc(var(--anchor-width)+1rem)] group-data-[side=none]:pr-12 group-data-[side=none]:text-base group-data-[side=none]:leading-4 data-[highlighted]:relative data-[highlighted]:z-0 data-[highlighted]:text-gray-50 data-[highlighted]:before:absolute data-[highlighted]:before:inset-x-1 data-[highlighted]:before:inset-y-0 data-[highlighted]:before:z-[-1] data-[highlighted]:before:rounded-sm data-[highlighted]:before:bg-gray-900 pointer-coarse:py-2.5 pointer-coarse:text-[0.925rem]',
        className,
      )}
      {...props}
    />
  );
}

export function ItemIndicator({ className, ...props }: Select.ItemIndicator.Props) {
  return <Select.ItemIndicator className={clsx('col-start-1', className)} {...props} />;
}

export function ItemText({ className, ...props }: Select.ItemText.Props) {
  return <Select.ItemText className={clsx('col-start-2', className)} {...props} />;
}
```

### Combobox

```tsx
import * as React from 'react';
import clsx from 'clsx';
import { Combobox } from '@base-ui/react/combobox';
import { X } from 'lucide-react';

export function Root(props: Combobox.Root.Props<any, any>) {
  return <Combobox.Root {...props} />;
}

export const Input = React.forwardRef<HTMLInputElement, Combobox.Input.Props>(function Input(
  { className, ...props }: Combobox.Input.Props,
  forwardedRef: React.ForwardedRef<HTMLInputElement>,
) {
  return (
    <Combobox.Input
      ref={forwardedRef}
      className={clsx(
        'h-10 w-64 rounded-md font-normal border border-gray-200 pl-3.5 text-base text-gray-900 bg-[canvas] focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-blue-800',
        className,
      )}
      {...props}
    />
  );
});

export function Clear({ className, ...props }: Combobox.Clear.Props) {
  return (
    <Combobox.Clear
      className={clsx(
        'combobox-clear flex h-10 w-6 items-center justify-center rounded bg-transparent p-0',
        className,
      )}
      {...props}
    >
      <X className="size-4" />
    </Combobox.Clear>
  );
}

export function Trigger({ className, ...props }: Combobox.Trigger.Props) {
  return (
    <Combobox.Trigger
      className={clsx(
        'flex h-10 w-6 items-center justify-center rounded bg-transparent p-0',
        className,
      )}
      {...props}
    />
  );
}

export function Portal(props: Combobox.Portal.Props) {
  return <Combobox.Portal {...props} />;
}

export function Positioner({ className, ...props }: Combobox.Positioner.Props) {
  return (
    <Combobox.Positioner className={clsx('outline-none', className)} sideOffset={4} {...props} />
  );
}

export function Popup({ className, ...props }: Combobox.Popup.Props) {
  return (
    <Combobox.Popup
      className={clsx(
        'w-[var(--anchor-width)] max-h-[23rem] max-w-[var(--available-width)] origin-[var(--transform-origin)] rounded-md bg-[canvas] text-gray-900 shadow-lg shadow-gray-200 outline-1 outline-gray-200 transition-[transform,scale,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 dark:shadow-none dark:-outline-offset-1 dark:outline-gray-300 duration-100',
        className,
      )}
      {...props}
    />
  );
}

export function Empty({ className, ...props }: Combobox.Empty.Props) {
  return (
    <Combobox.Empty
      className={clsx(
        'p-4 text-[0.925rem] leading-4 text-gray-600 empty:m-0 empty:p-0',
        className,
      )}
      {...props}
    />
  );
}

export function List({ className, ...props }: Combobox.List.Props) {
  return (
    <Combobox.List
      className={clsx(
        'outline-0 overflow-y-auto scroll-py-[0.5rem] py-2 overscroll-contain max-h-[min(23rem,var(--available-height))] data-[empty]:p-0',
        className,
      )}
      {...props}
    />
  );
}

export function Item({ className, ...props }: Combobox.Item.Props) {
  return (
    <Combobox.Item
      className={clsx(
        'grid cursor-default grid-cols-[0.75rem_1fr] items-center gap-2 py-2 pr-8 pl-4 text-base leading-4 outline-none select-none data-[highlighted]:relative data-[highlighted]:z-0 data-[highlighted]:text-gray-50 data-[highlighted]:before:absolute data-[highlighted]:before:inset-x-2 data-[highlighted]:before:inset-y-0 data-[highlighted]:before:z-[-1] data-[highlighted]:before:rounded-sm data-[highlighted]:before:bg-gray-900',
        className,
      )}
      {...props}
    />
  );
}

export function ItemIndicator({ className, ...props }: Combobox.ItemIndicator.Props) {
  return <Combobox.ItemIndicator className={clsx('col-start-1', className)} {...props} />;
}
```

### Autocomplete

```tsx
import * as React from 'react';
import clsx from 'clsx';
import { Autocomplete } from '@base-ui/react/autocomplete';

export function Root(props: Autocomplete.Root.Props<any>) {
  return <Autocomplete.Root {...props} />;
}

export const Input = React.forwardRef<HTMLInputElement, Autocomplete.Input.Props>(function Input(
  { className, ...props }: Autocomplete.Input.Props,
  forwardedRef: React.ForwardedRef<HTMLInputElement>,
) {
  return (
    <Autocomplete.Input
      ref={forwardedRef}
      className={clsx(
        'bg-[canvas] h-10 w-[16rem] md:w-[20rem] font-normal rounded-md border border-gray-200 pl-3.5 text-base text-gray-900 focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-blue-800',
        className,
      )}
      {...props}
    />
  );
});

export function Portal(props: Autocomplete.Portal.Props) {
  return <Autocomplete.Portal {...props} />;
}

export function Positioner({ className, ...props }: Autocomplete.Positioner.Props) {
  return (
    <Autocomplete.Positioner
      className={clsx('outline-none data-[empty]:hidden', className)}
      sideOffset={4}
      {...props}
    />
  );
}

export function Popup({ className, ...props }: Autocomplete.Popup.Props) {
  return (
    <Autocomplete.Popup
      className={clsx(
        'w-[var(--anchor-width)] max-h-[min(var(--available-height),23rem)] max-w-[var(--available-width)] overflow-y-auto scroll-pt-2 scroll-pb-2 overscroll-contain rounded-md bg-[canvas] py-2 text-gray-900 shadow-lg shadow-gray-200 outline-1 outline-gray-200 dark:shadow-none dark:-outline-offset-1 dark:outline-gray-300',
        className,
      )}
      {...props}
    />
  );
}

export function List(props: Autocomplete.List.Props) {
  return <Autocomplete.List {...props} />;
}

export function Item({ className, ...props }: Autocomplete.Item.Props) {
  return (
    <Autocomplete.Item
      className={clsx(
        'flex flex-col gap-0.25 cursor-default py-2 pr-8 pl-4 text-base leading-4 outline-none select-none data-[highlighted]:relative data-[highlighted]:z-0 data-[highlighted]:text-gray-50 data-[highlighted]:before:absolute data-[highlighted]:before:inset-x-2 data-[highlighted]:before:inset-y-0 data-[highlighted]:before:z-[-1] data-[highlighted]:before:rounded data-[highlighted]:before:bg-gray-900',
        className,
      )}
      {...props}
    />
  );
}
```

### Checkbox and CheckboxGroup

```tsx
// checkbox.tsx
import clsx from 'clsx';
import { Checkbox } from '@base-ui/react/checkbox';

export function Root({ className, ...props }: Checkbox.Root.Props) {
  return (
    <Checkbox.Root
      className={clsx(
        'flex size-5 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 data-[checked]:bg-gray-900 data-[unchecked]:border data-[unchecked]:border-gray-300',
        className,
      )}
      {...props}
    />
  );
}

export function Indicator({ className, ...props }: Checkbox.Indicator.Props) {
  return (
    <Checkbox.Indicator
      className={clsx('flex text-gray-50 data-[unchecked]:hidden', className)}
      {...props}
    />
  );
}
```

```tsx
// checkbox-group.tsx
import clsx from 'clsx';
import { CheckboxGroup as BaseCheckboxGroup } from '@base-ui/react/checkbox-group';

export function CheckboxGroup({ className, ...props }: BaseCheckboxGroup.Props) {
  return (
    <BaseCheckboxGroup
      className={clsx('flex flex-col items-start gap-1 text-gray-900', className)}
      {...props}
    />
  );
}
```

### Radio and RadioGroup

```tsx
// radio.tsx
import clsx from 'clsx';
import { Radio } from '@base-ui/react/radio';

export function Root({ className, ...props }: Radio.Root.Props) {
  return (
    <Radio.Root
      className={clsx(
        'flex size-5 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 data-[checked]:bg-gray-900 data-[unchecked]:border data-[unchecked]:border-gray-300',
        className,
      )}
      {...props}
    />
  );
}

export function Indicator({ className, ...props }: Radio.Indicator.Props) {
  return (
    <Radio.Indicator
      className={clsx(
        'flex before:size-2 before:rounded-full before:bg-gray-50 data-[unchecked]:hidden',
        className,
      )}
      {...props}
    />
  );
}
```

```tsx
// radio-group.tsx
import clsx from 'clsx';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';

export function RadioGroup({ className, ...props }: BaseRadioGroup.Props) {
  return (
    <BaseRadioGroup
      className={clsx('w-full flex flex-row items-start gap-1 text-gray-900', className)}
      {...props}
    />
  );
}
```

### Slider

```tsx
import clsx from 'clsx';
import { Slider } from '@base-ui/react/slider';

export function Root({ className, ...props }: Slider.Root.Props<any>) {
  return <Slider.Root className={clsx('grid grid-cols-2', className)} {...props} />;
}

export function Value({ className, ...props }: Slider.Value.Props) {
  return (
    <Slider.Value className={clsx('text-sm font-medium text-gray-900', className)} {...props} />
  );
}

export function Control({ className, ...props }: Slider.Control.Props) {
  return (
    <Slider.Control
      className={clsx('flex col-span-2 touch-none items-center py-3 select-none', className)}
      {...props}
    />
  );
}

export function Track({ className, ...props }: Slider.Track.Props) {
  return (
    <Slider.Track
      className={clsx(
        'h-1 w-full rounded bg-gray-200 shadow-[inset_0_0_0_1px] shadow-gray-200 select-none',
        className,
      )}
      {...props}
    />
  );
}

export function Indicator({ className, ...props }: Slider.Indicator.Props) {
  return (
    <Slider.Indicator className={clsx('rounded bg-gray-700 select-none', className)} {...props} />
  );
}

export function Thumb({ className, ...props }: Slider.Thumb.Props) {
  return (
    <Slider.Thumb
      className={clsx(
        'size-4 rounded-full bg-white outline outline-gray-300 select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-800',
        className,
      )}
      {...props}
    />
  );
}
```

### Switch

```tsx
import clsx from 'clsx';
import { Switch } from '@base-ui/react/switch';

export function Root({ className, ...props }: Switch.Root.Props) {
  return (
    <Switch.Root
      className={clsx(
        'relative flex h-6 w-10 rounded-full bg-gradient-to-r from-gray-700 from-35% to-gray-200 to-65% bg-[length:6.5rem_100%] bg-[100%_0%] bg-no-repeat p-px shadow-[inset_0_1.5px_2px] shadow-gray-200 outline outline-1 -outline-offset-1 outline-gray-200 transition-[background-position,box-shadow] duration-[125ms] ease-[cubic-bezier(0.26,0.75,0.38,0.45)] before:absolute before:rounded-full before:outline-offset-2 before:outline-blue-800 focus-visible:before:inset-0 focus-visible:before:outline focus-visible:before:outline-2 active:bg-gray-100 data-[checked]:bg-[0%_0%] data-[checked]:active:bg-gray-500 dark:from-gray-500 dark:shadow-black/75 dark:outline-white/15 dark:data-[checked]:shadow-none',
        className,
      )}
      {...props}
    />
  );
}

export function Thumb({ className, ...props }: Switch.Thumb.Props) {
  return (
    <Switch.Thumb
      className={clsx(
        'aspect-square h-full rounded-full bg-white shadow-[0_0_1px_1px,0_1px_1px,1px_2px_4px_-1px] shadow-gray-100 transition-transform duration-150 data-[checked]:translate-x-4 dark:shadow-black/25',
        className,
      )}
      {...props}
    />
  );
}
```

### Button (Form Submit)

```tsx
import { Button as BaseButton } from '@base-ui/react/button';
import clsx from 'clsx';

export function Button({ className, ...props }: React.ComponentPropsWithoutRef<'button'>) {
  return (
    <BaseButton
      type="submit"
      className={clsx(
        'flex items-center justify-center h-10 px-3.5 m-0 outline-0 border border-gray-200 rounded-md bg-gray-50 font-inherit text-base font-medium leading-6 text-gray-900 select-none hover:data-[disabled]:bg-gray-50 hover:bg-gray-100 active:data-[disabled]:bg-gray-50 active:bg-gray-200 active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] active:border-t-gray-300 active:data-[disabled]:shadow-none active:data-[disabled]:border-t-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-800 focus-visible:-outline-offset-1 data-[disabled]:text-gray-500',
        className,
      )}
      {...props}
    />
  );
}
```

## Quick Reference: Validation Modes

| Mode | Native (`validate`) | React Hook Form (`rules`) | TanStack (`validators`) |
|------|---------------------|---------------------------|------------------------|
| On submit | `validationMode="onSubmit"` (default) | Default behavior | `revalidateLogic({ mode: 'submit' })` |
| On blur | `validationMode="onBlur"` | `mode: 'onBlur'` | `onBlur` validator |
| On change | `validationMode="onChange"` | `mode: 'onChange'` | `onChange` / `onChangeAsync` validator |
| Debounced | `validationDebounceTime={300}` | N/A (use manual debounce) | `onChangeAsyncDebounceMs` |

## Additional References

- **Official quick start**: <https://base-ui.com/react/overview/quick-start>
- **Forms handbook**: <https://base-ui.com/react/handbook/forms>
- **Field component**: <https://base-ui.com/react/components/field>
- **Form component**: <https://base-ui.com/react/components/form>
- **Styling guide**: See `@.agents/skills/base-ui-styling/SKILL.md`
- **Animation guide**: See `@.agents/skills/base-ui-animation/SKILL.md`
- **Composition patterns**: See `@.agents/skills/base-ui-composition/SKILL.md`
- **Migration audit**: See `@.agents/skills/base-ui-migration-audit/SKILL.md`
