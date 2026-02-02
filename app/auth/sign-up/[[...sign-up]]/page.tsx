import { SignUp } from "@clerk/nextjs"

export default function SignUpPage() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center">
      <SignUp
        routing="path"
        path="/auth/sign-up"
        signInUrl="/auth/login"
        fallbackRedirectUrl="/"
      />
    </div>
  )
}
