# Mithra — Mağaza Finans Paneli

Shopify mağazaları için çoklu mağaza, gelir/gider, kategori ve kârlılık takibi yapan kompakt Next.js dashboardu.

## Özellikler

- Sağ üstten klasörlere göre mağaza seçme ve yeni mağaza oluşturma
- İsteğe bağlı mağaza klasörleri oluşturma, yeniden adlandırma ve mağazaları klasörler arasında taşıma
- Mağaza bilgilerini düzenleme, duraklatma ve onay ekranıyla bağlı kayıtlarıyla birlikte silme
- Klasör silindiğinde içindeki mağazaları koruyup klasörsüz gruba taşıma
- Mağaza bazında özel gelir/gider kategorileri
- Manuel gelir ve gider kaydı
- İşlemler ve son hareketler listesinden kayıt düzenleme; siparişe bağlı tutarları siparişle birlikte güncelleme
- Mağaza bazında ürün adı, ürün kodu, birim fiyat ve başlangıç stoğu oluşturma
- Stok ekleme/azaltma, az stok ve tükenen ürün filtreleri, satışa açık/kapalı ürün yönetimi
- Müşteri, ürün ve adet seçerek sipariş oluşturma; “Ürün ekle” ile tek siparişte birden fazla ürün/paket (bundle) oluşturma
- Ürün satırlarını ekleme/çıkarma, satır ve paket toplamını otomatik hesaplama; paket indirimi için sipariş tutarını değiştirme
- Sipariş oluşturulunca stoktan düşme; ürün/adet düzenlenince stok farkını uygulama
- İptal veya silmede daha önce düşülen stoğu yalnızca bir kez geri ekleme; teslimatta tekrar stok düşmeme
- Sipariş, stok ve bağlı finans kayıtlarını Firestore transaction ile birlikte güncelleme; yetersiz stokta siparişi engelleme
- Aktif, tamamlanan ve iptal edilen siparişlerin bilgilerini düzenleme; tamamlanan siparişin gelir/kargo kayıtlarını eş zamanlı güncelleme
- Onay ekranıyla sipariş ve ona bağlı gelir/kargo kayıtlarını birlikte silme
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

Veritabanına bağlanmadan arayüzü denemek için `.env.local` içine `NEXT_PUBLIC_DEMO_MODE=true` ekleyip geliştirme sunucusunu yeniden başlatın. Demo değişiklikleri yalnızca açık oturumda geçerlidir; sayfa yenilenince sıfırlanır. Gerçek veriler için bu değeri kaldırın veya `false` yapın.

## Firebase kurulumu

Firebase değişkenleri `.env.local` içinde tanımlıdır. Firebase Console üzerinde:

1. Firestore Database oluşturun.
2. Kuralları yayınlamak için Firebase CLI ile `firebase deploy --only firestore:rules` çalıştırın.

Kullanılan koleksiyonlar:

- `stores`: `name`, `domain`, `currency`, `status`, `color`, isteğe bağlı `folderId`
- `storeFolders`: `name`
- `categories`: `storeId`, `name`, `type`, `color`
- `transactions`: `storeId`, `categoryId`, `type`, `title`, `amount`, `date`, `note`
- `products`: `storeId`, `name`, `sku`, `price`, `stock`, `active`, `createdAt`, `updatedAt`
- `orders`: `storeId`, `customerName`, `product` (ürün adı), `productId`, `quantity`, `items` (ürün, adet, ad/fiyat bilgileri), `stockDeducted`, `amount`, `stage`, `status`, aşama notları ve kargo bilgisi

Çok ürünlü siparişler `items` listesinde saklanır; her satır ürün kimliği, adet, sipariş anındaki ürün adı ve birim fiyatını içerir. Her ürünün stoğu aynı Firestore transaction içinde güncellenir: satır ekleme/çıkarma ve adet değişikliklerinde yalnızca stok farkı uygulanır. Teslimatta paket toplamı tek gelir kaydı oluşturur. Eski tek ürünlü kayıtlar da okunur; düzenleme sırasında ek ürün seçilerek pakete dönüştürülebilir.

Eski, ürün bağlantısı olmayan siparişler korunur ve otomatik olarak stoktan düşülmez. Düzenleme sırasında ürün seçilirse stok takibine bağlanırlar. Sipariş oluşturulurken stok düşülür, teslimatta ikinci kez düşülmez. İptal veya silme, daha önce düşülmüş stoğu geri ekler; iptal edilmiş siparişin daha sonra silinmesi stok iadesini tekrarlamaz. Ürün adı/fiyatı değişiklikleri mevcut siparişlerin geçmiş bilgilerini değiştirmez. Stok tutarlılığı testleri Firestore transaction davranışını taklit eden yerel test katmanında çalışır.

Mevcut `firestore.rules` tek kullanıcı ve girişsiz kullanım isteğine göre doğrudan erişime açıktır. Uygulama herkese açık bir adreste yayınlanırsa bu kurallar veritabanını da herkese açar; böyle bir durumda kimlik doğrulama veya sunucu taraflı erişim eklenmelidir.

## Komutlar

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Shopify siparişlerini otomatik almak için sonraki aşamada sunucu taraflı Shopify Admin API/OAuth entegrasyonu ve webhook işleyicileri eklenmelidir. Shopify erişim anahtarı tarayıcıya konulmamalıdır.
