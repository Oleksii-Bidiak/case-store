"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui";
import { dict } from "@/shared/config";
import { ProductReviewsWidget } from "@/widgets/product-reviews";

/**
 * ProductSpecsTabs — Description / Specifications / Reviews tabs for the PDP.
 * Specifications is a placeholder until the product entity carries structured
 * specs; the Reviews tab renders the live {@link ProductReviewsWidget}.
 */
export function ProductSpecsTabs({
  description,
  productId,
}: {
  description: string | null;
  productId: string;
}) {
  return (
    <Tabs defaultValue="description" className="w-full">
      <TabsList className="w-full max-w-md">
        <TabsTrigger value="description">
          {dict.product.tabDescription}
        </TabsTrigger>
        <TabsTrigger value="specs">{dict.product.tabSpecs}</TabsTrigger>
        <TabsTrigger value="reviews">{dict.product.tabReviews}</TabsTrigger>
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

      <TabsContent value="reviews" className="pt-4">
        <ProductReviewsWidget productId={productId} />
      </TabsContent>
    </Tabs>
  );
}
