#!/bin/bash
# Script para generar todos los iconos necesarios desde una imagen fuente
# Uso: ./scripts/generate-icons.sh ruta/a/tu/imagen.png

set -e

# Verificar que se proporcionó una imagen
if [ -z "$1" ]; then
    echo "❌ Uso: $0 <imagen-fuente.png>"
    echo "   Ejemplo: $0 ~/Downloads/logo.png"
    exit 1
fi

SOURCE_IMAGE="$1"

# Verificar que la imagen existe
if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "❌ No se encontró la imagen: $SOURCE_IMAGE"
    exit 1
fi

# Verificar que ImageMagick está instalado
if ! command -v convert &> /dev/null; then
    echo "❌ ImageMagick no está instalado."
    echo "   Instálalo con: brew install imagemagick (macOS) o apt install imagemagick (Linux)"
    exit 1
fi

echo "🎨 Generando iconos desde: $SOURCE_IMAGE"

# Crear directorios si no existen
mkdir -p app
mkdir -p public

# Generar iconos para Next.js App Router (carpeta app/)
echo "📱 Generando icon.png (512x512)..."
convert "$SOURCE_IMAGE" -resize 512x512 -gravity center -background transparent -extent 512x512 app/icon.png

echo "🍎 Generando apple-icon.png (180x180)..."
convert "$SOURCE_IMAGE" -resize 180x180 -gravity center -background transparent -extent 180x180 app/apple-icon.png

echo "🔖 Generando favicon.ico..."
convert "$SOURCE_IMAGE" -resize 32x32 app/favicon.ico

# Generar iconos para PWA (carpeta public/)
echo "📦 Generando iconos PWA..."
convert "$SOURCE_IMAGE" -resize 192x192 -gravity center -background transparent -extent 192x192 public/icon-192.png
convert "$SOURCE_IMAGE" -resize 512x512 -gravity center -background transparent -extent 512x512 public/icon-512.png

# Iconos maskable (con padding para área segura - 80% del tamaño)
echo "🎭 Generando iconos maskable..."
convert "$SOURCE_IMAGE" -resize 154x154 -gravity center -background "#020617" -extent 192x192 public/icon-maskable-192.png
convert "$SOURCE_IMAGE" -resize 410x410 -gravity center -background "#020617" -extent 512x512 public/icon-maskable-512.png

# Copiar también a public para acceso directo
cp app/icon.png public/icon.png
cp app/apple-icon.png public/apple-icon.png

echo ""
echo "✅ ¡Iconos generados exitosamente!"
echo ""
echo "📁 Archivos creados:"
echo "   app/icon.png (512x512)"
echo "   app/apple-icon.png (180x180)"
echo "   app/favicon.ico (32x32)"
echo "   public/icon-192.png"
echo "   public/icon-512.png"
echo "   public/icon-maskable-192.png"
echo "   public/icon-maskable-512.png"
echo "   public/icon.png"
echo "   public/apple-icon.png"
echo ""
echo "🚀 ¡Reinicia el servidor de desarrollo para ver los cambios!"
