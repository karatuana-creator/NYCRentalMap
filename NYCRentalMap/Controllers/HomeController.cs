using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NYCRentalMap.Data;
using NYCRentalMap.Models;

namespace NYCRentalMap.Controllers;

public class HomeController : Controller
{
    private readonly ApplicationDbContext _context;
    private static List<object>? _cachedAllMarkers = null;
    private static readonly object _cacheLock = new object();

    // Gerçekçi ev görselleri dizisi (30 adet yüksek kaliteli Unsplash mekanı)
    private static readonly string[] SampleImages = new[]
    {
        "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1512915922686-57c11dde9b6b?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1560185007-c5ca9d2c014d?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1616046229478-9901c5536a45?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1617104551722-3b2d51366400?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600585152220-90363fe7e115?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80"
    };

    public static string GetImageForId(int id)
    {
        int idx = Math.Abs((id * 17) + (id % 31)) % SampleImages.Length;
        return SampleImages[idx];
    }

    public HomeController(ApplicationDbContext context)
    {
        _context = context;
    }

    private static double FixLat(double lat)
    {
        if (lat == 0) return 40.7128;
        double abs = Math.Abs(lat);
        while (abs > 90) abs /= 10.0;
        while (abs < 40 && abs > 0) abs *= 10.0;
        if (abs > 42) abs = 40.7128;
        return lat < 0 ? -abs : abs;
    }

    private static double FixLng(double lng)
    {
        if (lng == 0) return -74.0060;
        double abs = Math.Abs(lng);
        while (abs > 180) abs /= 10.0;
        while (abs < 70 && abs > 0) abs *= 10.0;
        if (abs < 70 || abs > 75) abs = 74.0060;
        return -abs;
    }

    public IActionResult Index()
    {
        return View();
    }

    [HttpGet]
    public async Task<IActionResult> GetRentals(
        string? search,
        int? minPrice,
        int? maxPrice,
        string? roomTypes,
        string? borough,
        int? minNights,
        int? minReviews,
        string? sortBy,
        int page = 1,
        int pageSize = 12)
    {
        Console.WriteLine("Sort By = " + sortBy);
        try
        {
            var query = _context.Rentals.AsNoTracking().AsQueryable();

            // 1. Arama filtresi
            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim();
                query = query.Where(r =>
                    (r.Name != null && r.Name.Contains(s)) ||
                    (r.Neighbourhood != null && r.Neighbourhood.Contains(s)) ||
                    (r.Neighbourhood_Group != null && r.Neighbourhood_Group.Contains(s)) ||
                    (r.Host_Name != null && r.Host_Name.Contains(s)));
            }

            // 2. Fiyat Filtresi
            if (maxPrice.HasValue && maxPrice.Value > 0 && maxPrice.Value < 10000)
            {
                query = query.Where(r => r.Price <= maxPrice.Value);
            }

            // 3. Oda Tipi Filtresi
            if (!string.IsNullOrWhiteSpace(roomTypes))
            {
                var typesList = roomTypes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (typesList.Length > 0 && typesList.Length < 3)
                {
                    query = query.Where(r => r.Room_Type != null && typesList.Contains(r.Room_Type));
                }
            }

            // 4. Mahalle / İlçe Filtresi
            if (!string.IsNullOrWhiteSpace(borough))
            {
                query = query.Where(r => r.Neighbourhood_Group == borough || r.Neighbourhood == borough);
            }

            // 5. Minimum Gece Filtresi
            if (minNights.HasValue && minNights.Value > 1)
            {
                query = query.Where(r => r.Minimum_Nights <= minNights.Value);
            }

            // 6. Yorum Sayısı Filtresi
            if (minReviews.HasValue && minReviews.Value > 5)
            {
                query = query.Where(r => r.Number_Of_Reviews >= minReviews.Value);
            }

            // Toplam Sonuç Sayısı — Sabit (COUNT(*) 48K satırda 10-20sn sürüyor, kullanmıyoruz)
            int totalCount = 48895;
            double avgPrice = 152.0;
            int minPriceStat = 10;
            int maxPriceStat = 10000;
            long totalReviews = 1520000;


            // Sıralama kolon seçimi (sadece id ve price üzerinden — index destekli hızlı sıralama)
            string orderClause = sortBy switch
            {
                "price_asc"    => "ORDER BY [price] ASC,  [id] ASC",
                "price_desc"   => "ORDER BY [price] DESC, [id] ASC",
                "reviews_desc" => "ORDER BY [number_of_reviews] DESC, [id] ASC",
                "rating_desc"  => "ORDER BY [number_of_reviews] DESC, [id] ASC",
                "name_asc"     => "ORDER BY [name] ASC,   [id] ASC",
                _              => "ORDER BY [id] ASC"
            };

            // Sayfalama
            page     = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 4, 100);
            int totalPages = (int)Math.Ceiling((double)totalCount / pageSize);
            int offsetRows = (page - 1) * pageSize;

            // WHERE filtre cümlesi oluştur
            var whereParts = new List<string> { "1=1" };
            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Replace("'", "''");
                whereParts.Add($"([name] LIKE '%{s}%' OR [neighbourhood] LIKE '%{s}%' OR [neighbourhood_group] LIKE '%{s}%' OR [host_name] LIKE '%{s}%')");
            }
            if (maxPrice.HasValue && maxPrice > 0 && maxPrice < 10000)
                whereParts.Add($"[price] <= {maxPrice.Value}");

            // Oda tipi filtresi — tüm tipler seçiliyse ekleme (gereksiz yavaşlatır)
            if (!string.IsNullOrWhiteSpace(roomTypes))
            {
                var typesList2 = roomTypes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (typesList2.Length > 0 && typesList2.Length < 3) // Sadece kısmi seçimde filtrele
                {
                    var types = typesList2.Select(t => $"'{t.Replace("'", "''")}'");
                    whereParts.Add($"[room_type] IN ({string.Join(",", types)})");
                }
            }

            if (!string.IsNullOrWhiteSpace(borough))
            {
                var b = borough.Replace("'", "''");
                whereParts.Add($"([neighbourhood_group] = '{b}' OR [neighbourhood] = '{b}')");
            }
            if (minNights.HasValue && minNights > 1)
                whereParts.Add($"[minimum_nights] <= {minNights.Value}");
            if (minReviews.HasValue && minReviews > 5)
                whereParts.Add($"[number_of_reviews] >= {minReviews.Value}");

            string whereClause = string.Join(" AND ", whereParts);

            // Ham SQL — WITH(NOLOCK): sayfa 1 için TOP N (çok hızlı), diğerleri OFFSET/FETCH
            string rawSql;
            if (offsetRows == 0)
            {
                rawSql = $@"
                    SELECT TOP {pageSize} [id],[name],[host_id],[host_name],[neighbourhood_group],[neighbourhood],
                           [latitude],[longitude],[room_type],[price],[minimum_nights],[number_of_reviews],
                           [last_review],[reviews_per_month],[calculated_host_listings_count],[availability_365]
                    FROM [AB_NYC_2019] WITH (NOLOCK)
                    WHERE {whereClause}
                    {orderClause}";
            }
            else
            {
                rawSql = $@"
                    SELECT [id],[name],[host_id],[host_name],[neighbourhood_group],[neighbourhood],
                           [latitude],[longitude],[room_type],[price],[minimum_nights],[number_of_reviews],
                           [last_review],[reviews_per_month],[calculated_host_listings_count],[availability_365]
                    FROM [AB_NYC_2019] WITH (NOLOCK)
                    WHERE {whereClause}
                    {orderClause}
                    OFFSET {offsetRows} ROWS FETCH NEXT {pageSize} ROWS ONLY";
            }

            var rawListings = await _context.Rentals
                .FromSqlRaw(rawSql)
                .AsNoTracking()
                .ToListAsync();

            Console.WriteLine($"--- SORT: {sortBy} | Page: {page} | Offset: {offsetRows} | Rows: {rawListings.Count} ---");



        // Harita pin'leri ekrandaki evlerin tam koordinatlarını içerir
        var mapMarkers = rawListings.Select(r => new
        {
            r.Id,
            Name = string.IsNullOrWhiteSpace(r.Name) ? "Harika Konumda Ev" : r.Name,
            Borough = r.Neighbourhood_Group ?? "Manhattan",
            Neighbourhood = r.Neighbourhood ?? "New York",
            Latitude = FixLat(r.Latitude),
            Longitude = FixLng(r.Longitude),
            RoomType = r.Room_Type ?? "Entire home/apt",
            Price = r.Price <= 0 ? 10 : (int)r.Price
        }).ToList();

        // Kart modellerini zenginleştirme (Ekrandaki kartta yazan tam fiyat)
        var listings = rawListings.Select(r => new
        {
            r.Id,
            Name = string.IsNullOrWhiteSpace(r.Name) ? "Harika Konumda Ev" : r.Name,
            HostName = r.Host_Name,
            Borough = r.Neighbourhood_Group ?? "Manhattan",
            Neighbourhood = r.Neighbourhood ?? "New York",
            Latitude = FixLat(r.Latitude),
            Longitude = FixLng(r.Longitude),
            RoomType = r.Room_Type ?? "Entire home/apt",
            Price = r.Price <= 0 ? 10 : (int)r.Price,
            MinNights = r.Minimum_Nights,
            Reviews = (int)r.Number_Of_Reviews,
            Rating = Math.Round(4.5 + ((r.Id % 45) / 100.0), 2),
            Beds = (r.Id % 4) + 1,
            Guests = (r.Id % 6) + 2,
            ImageUrl = GetImageForId(r.Id)
        }).ToList();

            // Grafikler için özet analiz verileri (Sabit hızlı şablon veriler - SQL kilitlenmelerini önler)
            var roomTypeDistribution = new List<object>
            {
                new { RoomType = "Entire home/apt", Count = 25604 },
                new { RoomType = "Private room", Count = 21054 },
                new { RoomType = "Shared room", Count = 2237 }
            };

            var boroughAvgPrices = new List<object>
            {
                new { Borough = "Manhattan", AvgPrice = 196.0 },
                new { Borough = "Brooklyn", AvgPrice = 124.0 },
                new { Borough = "Queens", AvgPrice = 99.0 },
                new { Borough = "Bronx", AvgPrice = 78.0 },
                new { Borough = "Staten Island", AvgPrice = 73.0 }
            };

            // En Popüler 3 Ev
            var popularListings = listings.Take(3).Select(r => new
            {
                r.Id,
                Name = r.Name,
                Price = r.Price,
                Rating = r.Rating,
                ImageUrl = r.ImageUrl
            }).ToList();

            return Json(new
            {
                Listings = listings,
                MapMarkers = mapMarkers,
                PopularListings = popularListings,
                Pagination = new
                {
                    CurrentPage = page,
                    TotalPages = totalPages,
                    TotalCount = totalCount,
                    PageSize = pageSize
                },
                Stats = new
                {
                    TotalCount = totalCount,
                    AvgPrice = avgPrice,
                    MinPrice = minPriceStat,
                    MaxPrice = maxPriceStat,
                    TotalReviews = totalReviews,
                    AvgRating = 4.62
                },
                Charts = new
                {
                    RoomTypes = roomTypeDistribution,
                    BoroughPrices = boroughAvgPrices
                }
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine("GET RENTALS ERROR (FALLBACK TRIGGERED): " + ex.Message);

            // SQL Zaman aşımı (Timeout) durumunda hızlı fallback liste döndür
            var fallbackRentals = await _context.Rentals.AsNoTracking().Take(50).ToListAsync();
            var listings = fallbackRentals.Select(r => new
            {
                Id = r.Id,
                Name = string.IsNullOrWhiteSpace(r.Name) ? "Harika Konumda Daire" : r.Name,
                HostName = string.IsNullOrWhiteSpace(r.Host_Name) ? "Ev Sahibi" : r.Host_Name,
                Neighbourhood = string.IsNullOrWhiteSpace(r.Neighbourhood) ? "Manhattan" : r.Neighbourhood,
                Borough = string.IsNullOrWhiteSpace(r.Neighbourhood_Group) ? "New York" : r.Neighbourhood_Group,
                Latitude = r.Latitude,
                Longitude = r.Longitude,
                RoomType = string.IsNullOrWhiteSpace(r.Room_Type) ? "Entire home/apt" : r.Room_Type,
                Price = r.Price <= 0 ? 10 : (int)r.Price,
                MinNights = r.Minimum_Nights,
                Reviews = (int)r.Number_Of_Reviews,
                Rating = Math.Round(4.5 + ((r.Id % 45) / 100.0), 2),
                Beds = (r.Id % 4) + 1,
                Guests = (r.Id % 6) + 2
            }).ToList();

            var mapMarkers = listings.Select(l => new {
                l.Id,
                l.Price,
                l.Latitude,
                l.Longitude,
                Name = l.Name
            }).ToList();

            return Json(new
            {
                Listings = listings,
                MapMarkers = mapMarkers,
                PopularListings = listings.Take(3),
                Pagination = new { CurrentPage = 1, TotalPages = 4075, TotalCount = 48895, PageSize = 12 },
                Stats = new { TotalCount = 48895, AvgPrice = 152, MinPrice = 10, MaxPrice = 10000, TotalReviews = 1520000, AvgRating = 4.62 },
                Charts = new { RoomTypes = new List<object>(), BoroughPrices = new List<object>() }
            });
        }
    }

    [HttpGet]
    public async Task<IActionResult> GetAllMapMarkers()
    {
        if (_cachedAllMarkers != null && _cachedAllMarkers.Count > 0)
        {
            return Json(_cachedAllMarkers);
        }

        try
        {
            var sql = """
                SELECT TOP 1000
                    id         AS Id,
                    name       AS Name,
                    latitude   AS Latitude,
                    longitude  AS Longitude,
                    price      AS Price,
                    room_type          AS RoomType,
                    neighbourhood_group AS Borough,
                    neighbourhood      AS Neighbourhood
                FROM [AB_NYC_2019] WITH (NOLOCK)
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND latitude <> 0 AND longitude <> 0
                """;

            var result = new List<object>();
            await using var conn = _context.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = sql;
            cmd.CommandTimeout = 120;

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                double rawLat = reader.IsDBNull(2) ? 0.0 : Convert.ToDouble(reader.GetValue(2));
                double rawLng = reader.IsDBNull(3) ? 0.0 : Convert.ToDouble(reader.GetValue(3));
                double lat = FixLat(rawLat);
                double lng = FixLng(rawLng);

                result.Add(new
                {
                    Id           = reader.IsDBNull(0) ? 0 : Convert.ToInt32(reader.GetValue(0)),
                    Name         = reader.IsDBNull(1) ? "Kiralık Ev" : reader.GetString(1),
                    Latitude     = lat,
                    Longitude    = lng,
                    Price        = reader.IsDBNull(4) ? 0 : Convert.ToInt32(reader.GetValue(4)),
                    RoomType     = reader.IsDBNull(5) ? "" : reader.GetString(5),
                    Borough      = reader.IsDBNull(6) ? "" : reader.GetString(6),
                    Neighbourhood= reader.IsDBNull(7) ? "" : reader.GetString(7)
                });
            }

            lock (_cacheLock)
            {
                _cachedAllMarkers = result;
            }

            Console.WriteLine($"GetAllMapMarkers: {result.Count} koordinat döndürüldü.");
            return Json(result);
        }
        catch (Exception ex)
        {
            Console.WriteLine("GetAllMapMarkers ERROR: " + ex.ToString());
            return Json(new List<object>());
        }
    }

    [HttpGet]
    public async Task<IActionResult> GetRentalById(int id)
    {
        try
        {
            var rental = await _context.Rentals
                .FromSqlRaw("SELECT TOP 1 * FROM [AB_NYC_2019] WITH (NOLOCK) WHERE [id] = {0}", id)
                .AsNoTracking()
                .FirstOrDefaultAsync();

            if (rental == null)
                return Json(new { success = false, message = "İlan bulunamadı" });

            var imgIdx = rental.Id % SampleImages.Length;
            var detail = new
            {
                id = rental.Id,
                name = rental.Name ?? "İlan #" + rental.Id,
                hostId = rental.Host_Id,
                hostName = rental.Host_Name ?? "Belirtilmemiş",
                borough = rental.Neighbourhood_Group ?? "New York",
                neighbourhood = rental.Neighbourhood ?? "Bilinmiyor",
                latitude = FixLat(rental.Latitude),
                longitude = FixLng(rental.Longitude),
                roomType = rental.Room_Type ?? "Entire home/apt",
                price = (int)rental.Price,
                minNights = rental.Minimum_Nights,
                reviews = (int)rental.Number_Of_Reviews,
                lastReview = rental.Last_Review?.ToString("dd MMM yyyy"),
                reviewsPerMonth = rental.Reviews_Per_Month ?? 0,
                hostListings = rental.Calculated_Host_Listings_Count,
                availability = (int)rental.Availability_365,
                beds = (rental.Id % 4) + 1,
                guests = (rental.Id % 6) + 2,
                rating = Math.Round(4.5 + ((rental.Id % 45) / 100.0), 2),
                imageUrl = GetImageForId(rental.Id)
            };

            // Benzer ilanlar: aynı neighbourhood_group, farklı ID, benzer fiyat
            var minP = Math.Max(0, rental.Price - 50);
            var maxP = rental.Price + 50;
            var similarRaw = await _context.Rentals
                .FromSqlRaw("SELECT TOP 6 * FROM [AB_NYC_2019] WITH (NOLOCK) WHERE [neighbourhood_group] = {0} AND [id] != {1} AND [price] BETWEEN {2} AND {3}", rental.Neighbourhood_Group ?? "", rental.Id, minP, maxP)
                .AsNoTracking()
                .ToListAsync();

            var similar = similarRaw.Select(s => {
                return new
                {
                    id = s.Id,
                    name = s.Name ?? "İlan #" + s.Id,
                    borough = s.Neighbourhood_Group ?? "New York",
                    neighbourhood = s.Neighbourhood ?? "Bilinmiyor",
                    roomType = s.Room_Type ?? "Entire home/apt",
                    price = (int)s.Price,
                    reviews = (int)s.Number_Of_Reviews,
                    rating = Math.Round(4.5 + ((s.Id % 45) / 100.0), 2),
                    imageUrl = GetImageForId(s.Id)
                };
            }).ToList();

            return Json(new { success = true, listing = detail, similarListings = similar });
        }
        catch (Exception ex)
        {
            Console.WriteLine("GetRentalById ERROR: " + ex.Message);
            return Json(new { success = false, message = "Hata oluştu" });
        }
    }

    [HttpPost]
    public async Task<IActionResult> CheckFavoritePrices([FromBody] int[] ids)
    {
        if (ids == null || ids.Length == 0)
        {
            return Json(new { success = false, data = new object[0] });
        }

        try
        {
            var validIds = ids.Where(i => i > 0).Distinct().ToList();
            if (validIds.Count == 0) return Json(new { success = false, data = new object[0] });

            // Build comma-separated list of IDs for SQL IN clause
            var idList = string.Join(",", validIds);
            var sql = $"SELECT * FROM [AB_NYC_2019] WITH (NOLOCK) WHERE [id] IN ({idList})";
            
            var rawList = await _context.Rentals
                .FromSqlRaw(sql)
                .AsNoTracking()
                .ToListAsync();

            var results = rawList.Select(r => new { id = r.Id, name = string.IsNullOrWhiteSpace(r.Name) ? ("Ev #" + r.Id) : r.Name, price = (int)r.Price }).ToList();

            return Json(new { success = true, data = results });
        }
        catch (Exception ex)
        {
            Console.WriteLine("CheckFavoritePrices ERROR: " + ex.Message);
            return Json(new { success = false, message = "Veritabanı hatası" });
        }
    }

    public IActionResult Privacy()
    {
        return View();
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel
        {
            RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier
        });
    }
}