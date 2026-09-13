# Mithra — Mağaza Finans Paneli

Shopify mağazaları için çoklu mağaza, gelir/gider, kategori ve kârlılık takibi yapan kompakt Next.js dashboardu.

## Özellikler

- Sağ üstten mağaza değiştirme ve yeni mağaza oluşturma
- Mağaza bazında özel gelir/gider kategorileri
- Manuel gelir ve gider kaydı
- İşlemler ve son hareketler listesinden kayıt düzenleme; siparişe bağlı tutarları siparişle birlikte güncelleme
- Müşteri, ürün ve tutar bilgisiyle sipariş oluşturma
- İletişim, geri dönüş, konum/kargo ve teslimat aşamalarını adım adım takip etme
- Teslim edilen sipariş gelirini ve kargo giderini finans raporlarına otomatik aktarma
- İptal edilen siparişlerde kargo masrafını isteğe bağlı olarak giderlere işleme
- Günlük, haftalık, aylık, yıllık ve özel tarih aralığı filtreleri
- Net kâr, toplam gelir, toplam gider ve kâr marjı metrikleri
- Gelir/gider zaman grafiği ve kategori dağılımı
- Responsive masaüstü/mobil arayüz
- Firebase Firestore gerçek zamanlı veri katmanı
- Firebase erişilemezse otomatik demo veri modu

## Çalıştırma

```bash
npm install
npm run dev
```

Uygulama `http://localhost:3000` adresinde açılır.

## Firebase kurulumu

Firebase değişkenleri `.env.local` içinde tanımlıdır. Firebase Console üzerinde:

1. Firestore Database oluşturun.
2. Kuralları yayınlamak için Firebase CLI ile `firebase deploy --only firestore:rules` çalıştırın.

Kullanılan koleksiyonlar:

- `stores`: `name`, `domain`, `currency`, `status`, `color`
- `categories`: `storeId`, `name`, `type`, `color`
- `transactions`: `storeId`, `categoryId`, `type`, `title`, `amount`, `date`, `note`
- `orders`: `storeId`, `customerName`, `product`, `amount`, `stage`, `status`, aşama notları ve kargo bilgisi

Mevcut `firestore.rules` tek kullanıcı ve girişsiz kullanım isteğine göre doğrudan erişime açıktır. Uygulama herkese açık bir adreste yayınlanırsa bu kurallar veritabanını da herkese açar; böyle bir durumda kimlik doğrulama veya sunucu taraflı erişim eklenmelidir.

## Komutlar

```bash
npm run lint
npm run typecheck
npm run build
```

Shopify siparişlerini otomatik almak için sonraki aşamada sunucu taraflı Shopify Admin API/OAuth entegrasyonu ve webhook işleyicileri eklenmelidir. Shopify erişim anahtarı tarayıcıya konulmamalıdır.
