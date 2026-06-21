"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useUserControllerUpdateProfile,
  getUserControllerGetProfileQueryKey,
  type UserEntity,
} from "@/entities/user";
import { Button, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";
import { profileSchema, type ProfileFormValues } from "../model/profile-schema";

interface ProfileFormProps {
  user: UserEntity;
}

/**
 * ProfileForm — edits the current user's name and phone via `PUT /api/users/me`.
 * Email is displayed read-only. On success the cached profile is invalidated and
 * a toast is shown. Mirrors the auth/checkout form conventions (RHF + zod).
 */
export function ProfileForm({ user }: ProfileFormProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      phone: user.phone ?? "",
    },
  });

  const mutation = useUserControllerUpdateProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getUserControllerGetProfileQueryKey(),
        });
        toast.success(dict.account.saved);
      },
      onError: () => {
        toast.error(dict.account.updateError);
      },
    },
  });

  const onSubmit = (values: ProfileFormValues) => {
    mutation.mutate({
      data: {
        firstName: values.firstName || undefined,
        lastName: values.lastName || undefined,
        phone: values.phone || undefined,
      },
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-email">{dict.account.email}</Label>
        <Input
          id="account-email"
          type="email"
          value={user.email}
          readOnly
          disabled
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-firstName">{dict.account.firstName}</Label>
          <Input
            id="account-firstName"
            autoComplete="given-name"
            {...register("firstName")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-lastName">{dict.account.lastName}</Label>
          <Input
            id="account-lastName"
            autoComplete="family-name"
            {...register("lastName")}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-phone">{dict.account.phone}</Label>
        <Input
          id="account-phone"
          type="tel"
          autoComplete="tel"
          aria-invalid={errors.phone ? true : undefined}
          {...register("phone")}
        />
        {errors.phone && (
          <p role="alert" className="text-sm text-destructive">
            {errors.phone.message}
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={mutation.isPending || !isDirty}
        className="self-start"
      >
        {mutation.isPending ? dict.account.saving : dict.account.save}
      </Button>
    </form>
  );
}
