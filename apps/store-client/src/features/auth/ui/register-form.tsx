"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, useAuthControllerRegister } from "@/entities/session";
import { getGetCartQueryKey } from "@/entities/cart";
import { dict } from "@/shared/config";

const registerSchema = z
  .object({
    email: z.string().email(dict.auth.register.validationEmail),
    firstName: z.string().min(1, dict.auth.register.validationFirstName),
    lastName: z.string().min(1, dict.auth.register.validationLastName),
    password: z.string().min(8, dict.auth.register.validationPassword),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: dict.auth.register.validationPasswordMatch,
    path: ["passwordConfirm"],
  });

type RegisterValues = z.infer<typeof registerSchema>;

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** RegisterForm — account creation with zod validation. */
export function RegisterForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setTokens } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const registerUser = useAuthControllerRegister();

  const onSubmit = (values: RegisterValues) => {
    registerUser.mutate(
      {
        data: {
          email: values.email,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
        },
      },
      {
        onSuccess: (res) => {
          const token = res?.data?.accessToken;
          if (token) {
            setTokens(token);
          }
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
          router.push("/");
        },
      },
    );
  };

  const status = registerUser.error?.response?.status;
  const errorMessage =
    status === 409
      ? dict.auth.register.errorConflict
      : registerUser.isError
        ? dict.common.genericError
        : null;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor="reg-email"
          className="text-sm font-medium text-foreground"
        >
          {dict.auth.register.email}
        </label>
        <input
          id="reg-email"
          type="email"
          autoComplete="email"
          className={fieldClass}
          {...register("email")}
        />
        {errors.email && (
          <p role="alert" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="reg-first"
            className="text-sm font-medium text-foreground"
          >
            {dict.auth.register.firstName}
          </label>
          <input
            id="reg-first"
            type="text"
            autoComplete="given-name"
            className={fieldClass}
            {...register("firstName")}
          />
          {errors.firstName && (
            <p role="alert" className="text-sm text-destructive">
              {errors.firstName.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="reg-last"
            className="text-sm font-medium text-foreground"
          >
            {dict.auth.register.lastName}
          </label>
          <input
            id="reg-last"
            type="text"
            autoComplete="family-name"
            className={fieldClass}
            {...register("lastName")}
          />
          {errors.lastName && (
            <p role="alert" className="text-sm text-destructive">
              {errors.lastName.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="reg-password"
          className="text-sm font-medium text-foreground"
        >
          {dict.auth.register.password}
        </label>
        <input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          className={fieldClass}
          {...register("password")}
        />
        {errors.password && (
          <p role="alert" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="reg-password-confirm"
          className="text-sm font-medium text-foreground"
        >
          {dict.auth.register.confirmPassword}
        </label>
        <input
          id="reg-password-confirm"
          type="password"
          autoComplete="new-password"
          className={fieldClass}
          {...register("passwordConfirm")}
        />
        {errors.passwordConfirm && (
          <p role="alert" className="text-sm text-destructive">
            {errors.passwordConfirm.message}
          </p>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={registerUser.isPending}
        className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {registerUser.isPending
          ? dict.auth.register.submitting
          : dict.auth.register.submit}
      </button>

      <p className="text-sm text-muted-foreground">
        {dict.auth.register.haveAccount}{" "}
        <Link href="/login" className="text-primary hover:underline">
          {dict.auth.register.signInLink}
        </Link>
      </p>
    </form>
  );
}
