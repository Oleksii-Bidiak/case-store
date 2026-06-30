// Shared UI — Base UI components (shadcn/ui and custom primitives)

// shadcn/ui primitives
export { Button, buttonVariants } from "./button";
export { Badge, badgeVariants } from "./badge";
export { Input } from "./input";
export { PhoneInput } from "./phone-input";
export { Combobox, type ComboboxOption, type ComboboxProps } from "./combobox";
export {
  AccountDropdown,
  AccountDropdownItem,
  type AccountDropdownProps,
  type AccountDropdownItemProps,
} from "./account-dropdown";
export { Label } from "./label";
export { Textarea } from "./textarea";
export { Separator } from "./separator";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
export { Toaster } from "./sonner";

// Custom primitives
export { Skeleton } from "./skeleton";
export { CheckoutSkeleton } from "./checkout-skeleton";
export { ProductCard } from "./product-card";
export { ColorDots } from "./color-dots";
export { ProductCardImage } from "./product-card-image";
export { ProductThumb } from "./product-thumb";
export { BLUR_PLACEHOLDER } from "./image-placeholder";
export { RatingStars } from "./rating-stars";
export { JsonLd } from "./json-ld";
