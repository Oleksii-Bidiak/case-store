import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@store/store-client";

const body: React.CSSProperties = {
  fontSize: 14,
  color: "var(--color-muted-foreground)",
  paddingTop: 8,
  maxWidth: 420,
};

export const ProductDetails = () => (
  <div style={{ width: 440 }}>
    <Tabs defaultValue="description">
      <TabsList>
        <TabsTrigger value="description">Description</TabsTrigger>
        <TabsTrigger value="specs">Specs</TabsTrigger>
        <TabsTrigger value="reviews">Reviews</TabsTrigger>
      </TabsList>
      <TabsContent value="description">
        <p style={body}>
          Durable braided nylon USB-C cable with fast-charge support up to 100W
          and a 2-metre reach.
        </p>
      </TabsContent>
      <TabsContent value="specs">
        <p style={body}>Length 2m · USB-C to USB-C · 100W PD · Nylon braid.</p>
      </TabsContent>
      <TabsContent value="reviews">
        <p style={body}>213 reviews · 4.6 average rating.</p>
      </TabsContent>
    </Tabs>
  </div>
);
