import { SignIn } from "@clerk/nextjs"

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center">
      <SignIn
        routing="path"
        path="/auth/login"
        signUpUrl="/auth/sign-up"
        fallbackRedirectUrl="/"
      />
    </div>
  )
}
