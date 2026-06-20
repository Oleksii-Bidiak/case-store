"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * ProductSpecsTabs — Description / Specifications / Reviews tabs for the PDP.
 * Specifications and Reviews are placeholders until the product entity carries
 * structured specs and a reviews endpoint exists (tracked separately).
 */
export function ProductSpecsTabs({
  description,
}: {
  description: string | null;
}) {
  return (
    <Tabs defaultValue="description" className="w-full">
      <TabsList className="w-full max-w-md">
        <TabsTrigger value="description">
          {dict.product.tabDescription}
        </TabsTrigger>
        <TabsTrigger value="specs">{dict.product.tabSpecs}</TabsTrigger>
        <TabsTrigger value="reviews" disabled>
          {dict.product.tabReviews}
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="description"
        className="pt-4 text-sm whitespace-pre-line text-muted-foreground"
      >
        {description && description.length > 0
          ? description
          : dict.product.specsEmpty}
      </TabsContent>

      <TabsContent value="specs" className="pt-4 text-sm text-muted-foreground">
        {dict.product.specsEmpty}
      </TabsContent>

      <TabsContent
        value="reviews"
        className="pt-4 text-sm text-muted-foreground"
      >
        {dict.product.reviewsSoon}
      </TabsContent>
    </Tabs>
  );
}
