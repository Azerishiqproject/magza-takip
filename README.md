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
- Mağaza bazında ürün adı, ürün kodu, satış fiyatı, alış fiyatı ve başlangıç stoğu oluşturma
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
- Mağazalar bölümünde tüm mağazaların veya seçilen klasörün satış/gelir, gider ve net kâr-zarar raporu
- Rapora mağaza dahil etme/çıkarma; aktif/duraklatılmış mağaza, tarih ve kategori filtreleri
- Gelir kaydı oluşmadan günlük sipariş sayısını gösteren “Satış adedi” grafiği; sipariş durumu ve iptal filtreleri
- Yalnızca gelir, gider veya net sonuç gösteren zaman, mağaza, klasör ve kategori grafikleri; ayrıntılı toplam tabloları
- Aynı ad ve türdeki mağaza kategorilerini birleştirme; farklı para birimlerini ayrı raporlama
- Ayrı Raporlar / Mağazalarım görünümleri; mağaza arama ve tek Yönet ekranından düzenleme, duraklatma, klasör değiştirme ve silme
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

- `stores`: `name`, `domain`, `currency`, `status`, `color`, isteğe bağlı `folderId` ve `profitSettings`
- `storeFolders`: `name`
- `categories`: `storeId`, `name`, `type`, `color`
- `transactions`: `storeId`, `categoryId`, `type`, `title`, `amount`, `date`, `note`
- `products`: `storeId`, `name`, `sku`, `price`, `purchasePrice`, `stock`, `active`, `createdAt`, `updatedAt`
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


## Mağazalar raporu

**Mağazalar → Raporlar** günlük satış adediyle açılır. Üstteki **Mağazalar / klasörler** alanından birden fazla mağazayı aynı anda işaretleyebilir, bir klasörün tamamını seçebilir veya arama yapabilirsiniz. Seçili mağazaların grafikleri ve toplamları birlikte hesaplanır. Dönem ve gösterilecek veri yanındaki menülerden belirlenir. **Göster** menüsündeki Finans özeti, Gelir, Gider ve Kâr / zarar seçenekleri tutar grafiğini açar. Grafik yanındaki seçimle zaman, mağaza, klasör veya finans kategorisi karşılaştırmasına geçilir.

**Filtreler** düğmesi mağaza durumu ve sipariş durumu/finans kategorisi seçeneklerini açar. Ek filtreler kapalıyken de etkin seçimler görünür; **Sıfırla** ile temizlenebilir. Ek filtreleri sıfırlamak ana mağaza seçimini değiştirmez. Ayrıntılı toplamlar **Ayrıntılı tablo** bölümündedir. Farklı para birimleri finans raporunda ayrı hesaplanır; para birimi menüsüyle aralarında geçiş yapılır.

**Satış adedi** gelir kaydı oluşmasını beklemeden siparişleri oluşturuldukları yerel takvim gününe göre sayar. Paket siparişler tek satış sayılır. Varsayılan olarak iptaller hariçtir; filtrelerden iptaller dahil tümü veya belirli bir sipariş durumu seçilebilir. Farklı para birimlerinde satış yapan mağazaların adetleri birlikte sayılır. Bir yıla kadar günlük, daha uzun aralıklarda aylık/yıllık adetler gösterilir.

Finans raporu teslim edilen siparişlerin finans kayıtlarını ve manuel gelir/giderleri kullanır; siparişler ayrıca eklenerek çift sayılmaz. Aynı ad ve türdeki kategoriler birleştirilir. Silinmiş/kategorisiz kayıtlar “Kategorisiz” altında görünür. Kategori seçilirse özet ve grafik yalnızca o kategoriyi kapsar. Uzun tarih aralıkları aylık/yıllık gruplara ayrılır.

**Mağazalarım** bölümünde mağaza arayabilir, mağaza veya klasör oluşturabilirsiniz. Mağazanın **Yönet** düğmesi ad, domain, klasör ve aktif/duraklatılmış durumunu düzenler. Silme işlemi bu ekrandan ayrı onayla başlatılır. Raporlar ile Mağazalarım arasında geçiş yapmak rapor seçimlerini korur.

## Mağaza bazında ROAS ve ürün kârı

**Ürünler ve stok** bölümünde her ürüne satış fiyatının yanında **alış fiyatı** girilir. Alış fiyatına kargo ve paket eklenmez. Yeni ürünlerde alış fiyatı zorunludur; eski ürünler düzenlenerek tamamlanabilir. Sıfır maliyet açıkça girilebilir, boş alış fiyatı sıfır kabul edilmez.

Ana sayfadaki **ROAS ve ürün kârı** düğmesi ayrı bir pencere açar. Ayarlardan her mağazanın reklam gideri kategorileri ve satış geliri kaynağı seçilir. Eski ortalama satış fiyatı / maliyet oranı ve paket kargo indirimi artık kullanılmaz.

- Gelir kaynağı varsayılan olarak **Sipariş gelirleri** kategorisidir. Yalnızca seçili dönemin seçili finans kayıtları gelir sayılır; sipariş tutarları ayrıca eklenmez.
- Her gelir, bağlı olduğu tamamlanmış siparişin ürünlerine eşlenir. **Alış maliyeti = her ürünün stoktaki güncel alış fiyatı × siparişteki adedi**. Aynı veya farklı ürünlerden oluşan paketler desteklenir. Alış fiyatı siparişe kopyalanmaz; stok ekranında fiyat değiştirildiğinde geçmiş siparişlerin hesabı da güncellenir.
- **AZN siparişlerinde sipariş başına bir kez 4 ₼ kargo + 1 ₼ paket** eklenir. Ürün sayısı kargo tutarını artırmaz veya maliyetten indirim oluşturmaz. Yeni AZN siparişlerinin kayıtlı kargo tutarı da varsayılan 4 ₼ olur. Diğer para birimlerinde siparişte kayıtlı kargo kullanılır; 4 AZN başka para birimine dönüşümsüz uygulanmaz.
- Bir siparişin seçili dönemde birden fazla gelir kaydı varsa gelirleri toplanır, ürün maliyeti, kargo ve paket bir kez sayılır. Aynı finans kaydının tekrarları gelir veya maliyeti çoğaltmaz.
- **ROAS = seçili satış geliri / seçili reklam gideri**. Reklam gideri yoksa oran gösterilmez.
- **Ürün kârı = gelir − satılan ürünlerin alış maliyeti − sipariş kargosu − paket − reklam**. Stok alımları, domain, toplu paket alımları, iptal kargoları ve diğer giderler bu bölüme eklenmez. Ayrı kargo gider kayıtları ikinci kez düşülmez.
- **Sipariş başa baş ROAS = sipariş geliri / (sipariş geliri − alış maliyeti − kargo − paket)**. Toplam başa baş ROAS da toplam gelir ve toplam katkıyla hesaplanır; sipariş oranlarının aritmetik ortalaması değildir. Katkı sıfır veya negatifse sonlu bir eşik gösterilmez.
- Ürün bağlantısı olmayan eski siparişlerde açık adet bilgisi (`2 eded`, `1ədəd yastıq`, `2` gibi) okunur. Mağazada tek ürün varsa veya tüm ürün/bedenlerin stok alış fiyatı aynıysa bu güncel fiyat kullanılır; eski kayda rastgele bir beden atanmaz ve stok değiştirilmez. Farklı alış fiyatları varsa ürün eşleştirmesi gerekir. Ürün kimliği olan fakat ürünü silinmiş kayıtlar bu otomatik eşleştirmeye alınmaz.
- Sipariş bağlantısı olmadan kaydedilmiş manuel satışlarda da açık ürün adedi ve aynı fiyat koşulu kullanılır. `2 eded` tek paket içindeki iki ürün sayılır. `2 Sifaris` gibi kayıtlar yalnızca sipariş sayısı belirttiği için ürün adedi ve gönderilen paket sayısı kullanıcı tarafından onaylanır. Ürün adedi satış tutarından tahmin edilmez.
- **Eski kayıt eşleştirmeleri** bölümünde ürün/adet ve ayrı paket sayısı kaydedilebilir. Transfer gibi satış olmayan manuel gelirler yalnızca ROAS hesabından çıkarılabilir. Bu seçimler mağazanın `profitSettings.costMappings` alanında ürün kimliği, adet ve paket sayısı veya hariç tutma tercihi olarak tutulur; alış fiyatı kopyalanmaz. Başka mağazadan satılmış eski bir ürün için aynı para birimindeki mağazanın ortak alış fiyatı açıkça seçilebilir. Bu kaynak mağazanın tüm ürünlerinin alış fiyatı aynı olmalıdır; fiyatlar farklılaşırsa maliyet yeniden eşleştirilene kadar kâr gösterilmez. Kaynak mağazanın güncel stok fiyatı kullanılır, stok adedi değişmez. Sipariş, ürün stokları ve finans kayıtları değiştirilmez. Kaydedilen eşleştirmeler aynı bölümden düzenlenebilir veya kaldırılabilir.
- Alış fiyatı, ürün/adet bağlantısı veya gerekli kargo bilgisi eksikse ROAS hesaplanabilir; kâr ve başa baş ROAS eksikler tamamlanana kadar gösterilmez. Eksik kayıtlar pencerede belirtilir.

Pencerede seçili tarih aralığı, ROAS, başa baş eşiği, ürün kârı ve maliyetlerin dökümü bulunur. **Sipariş bazında maliyet ve başa baş ROAS** bölümü her siparişin gelirini, ürün maliyetini, kargosunu, paket giderini ve reklam öncesi katkısını gösterir. Reklam yalnızca dönem toplamından düşülür. Sipariş kartlarında da kargo ve paket dahil maliyet ve başa baş ROAS bulunur.

Ana sayfadaki gider dağılımı kartında **Gider dağılımı / ROAS** düğmeleri bulunur. Küçük ve büyük ROAS görünümü aynı hesaplama fonksiyonunu ve ana sayfanın dönem filtresini kullanır. Tüm mağazaların karşılaştırması büyük pencerenin içindedir. Genel gelir-gider raporları kayıtlı finans işlemlerini kullanmaya devam eder; geçmiş işlem ve sipariş kayıtları yeniden yazılmaz.
