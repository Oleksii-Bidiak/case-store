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
        <TabsTrigger value="description">Опис</TabsTrigger>
        <TabsTrigger value="specs">Характеристики</TabsTrigger>
        <TabsTrigger value="reviews">Відгуки</TabsTrigger>
      </TabsList>
      <TabsContent value="description">
        <p style={body}>
          Кабель у нейлоновому обплетенні з підтримкою швидкого заряджання до
          60 Вт. Довжина 2 м — вистачить від розетки до дивана.
        </p>
      </TabsContent>
      <TabsContent value="specs">
        <p style={body}>Довжина 2 м · USB-C → USB-C · 60 Вт PD · нейлон.</p>
      </TabsContent>
      <TabsContent value="reviews">
        <p style={body}>213 відгуків · середня оцінка 4,6.</p>
      </TabsContent>
    </Tabs>
  </div>
);
