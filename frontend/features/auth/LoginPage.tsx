"use client";

import { LoginForm } from './LoginForm'
import Image from 'next/image'

export function LoginPage() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background">
      <div className="flex w-full max-w-sm flex-col px-8">
        <div className="flex flex-col justify-center">
          <div className="mx-auto flex w-full max-w-xs flex-col gap-3">
            <p className="text-center text-sm font-semibold text-black -mb-7">
              Welcome to login
            </p>
            <Image
              src="/OmniAge_Logo_4K.svg"
              alt="OmniAge Logo"
              width={200}
              height={80}
              className="mx-auto"
            />
            <LoginForm />
          </div>
        </div>
        <p className="pb-10 pt-8 text-center text-sm font-semibold text-black">
          Build the intelligence<br />Use the intelligence
        </p>
      </div>
    </div>
  )
}
