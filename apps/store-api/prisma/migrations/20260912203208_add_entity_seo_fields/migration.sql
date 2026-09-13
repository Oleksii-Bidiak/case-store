-- AlterTable
ALTER TABLE "blog_posts" ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "meta_description" TEXT,
ADD COLUMN     "meta_title" TEXT,
ADD COLUMN     "og_image" TEXT;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "og_image" TEXT;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "og_image" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "og_image" TEXT;
