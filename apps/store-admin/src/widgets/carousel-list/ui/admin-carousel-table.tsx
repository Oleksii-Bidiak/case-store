"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminCarouselControllerFindAllQueryKey,
  useAdminCarouselControllerFindAll,
  useAdminCarouselControllerPublish,
  useAdminCarouselControllerUnpublish,
  useAdminCarouselControllerDelete,
  type CarouselEntity,
} from "@/entities/carousel";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { AdminCarouselTableSkeleton } from "./admin-carousel-table-skeleton";

/**
 * Admin carousels view: one flat table of title, source badge, status badge,
 * sort order, and per-row actions (edit, publish/unpublish toggle keyed on
 * `status`, delete with confirm). Carousels are low-volume admin content, so
 * the whole set loads at once with no search/pagination — mirrors
 * `AdminBannerTable` minus the placement grouping (carousels have none).
 */
export function AdminCarouselTable() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useAdminCarouselControllerFindAll();
  const publish = useAdminCarouselControllerPublish();
  const unpublish = useAdminCarouselControllerUnpublish();
  const remove = useAdminCarouselControllerDelete();

  const carousels = data?.data ?? [];

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminCarouselControllerFindAllQueryKey(),
    });

  const handleToggle = (id: string, isPublished: boolean) => {
    const mutation = isPublished ? unpublish : publish;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(
            isPublished
              ? dict.carousels.toastUnpublished
              : dict.carousels.toastPublished,
          );
        },
        onError: () => toast.error(dict.carousels.toastStatusFailed),
      },
    );
  };

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(dict.carousels.deleteConfirm(title))) return;
    remove.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.carousels.toastDeleted);
        },
        onError: () => toast.error(dict.carousels.toastDeleteFailed),
      },
    );
  };

  if (isLoading) {
    return <AdminCarouselTableSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.carousels.loadError}
      </p>
    );
  }

  if (carousels.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {dict.carousels.empty}
      </div>
    );
  }

  const isMutating =
    publish.isPending || unpublish.isPending || remove.isPending;

  return (
    <div className="rounded-lg border border-border shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{dict.carousels.colTitle}</TableHead>
            <TableHead>{dict.carousels.colSource}</TableHead>
            <TableHead>{dict.carousels.colStatus}</TableHead>
            <TableHead hideOnMobile>{dict.carousels.colSort}</TableHead>
            <TableHead className="text-right">{dict.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {carousels.map((carousel) => (
            <CarouselRow
              key={carousel.id}
              carousel={carousel}
              isMutating={isMutating}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface CarouselRowProps {
  carousel: CarouselEntity;
  isMutating: boolean;
  onToggle: (id: string, isPublished: boolean) => void;
  onDelete: (id: string, title: string) => void;
}

function CarouselRow({
  carousel,
  isMutating,
  onToggle,
  onDelete,
}: CarouselRowProps) {
  const isPublished = carousel.status === "PUBLISHED";

  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link
          href={`/carousels/${carousel.id}/edit`}
          className="hover:underline"
        >
          {carousel.title}
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant="outline">
          {dict.carousels.sourceLabels[carousel.source]}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={isPublished ? "default" : "secondary"}>
          {dict.carousels.statusLabels[carousel.status]}
        </Badge>
      </TableCell>
      <TableCell hideOnMobile>{carousel.sortOrder}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/carousels/${carousel.id}/edit`}>
              {dict.common.edit}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isMutating}
            onClick={() => onToggle(carousel.id, isPublished)}
          >
            {isPublished ? dict.carousels.unpublish : dict.carousels.publish}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isMutating}
            onClick={() => onDelete(carousel.id, carousel.title)}
          >
            {dict.common.delete}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
