using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NYCRentalMap.Models
{
    [Table("AB_NYC_2019")]
    public class Rental
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Column("name")]
        public string? Name { get; set; }

        [Column("host_id")]
        public int Host_Id { get; set; }

        [Column("host_name")]
        public string? Host_Name { get; set; }

        [Column("neighbourhood_group")]
        public string? Neighbourhood_Group { get; set; }

        [Column("neighbourhood")]
        public string? Neighbourhood { get; set; }

        [Column("latitude")]
        public double Latitude { get; set; }

        [Column("longitude")]
        public double Longitude { get; set; }

        [Column("room_type")]
        public string? Room_Type { get; set; }

        [Column("price")]
        public short Price { get; set; }

        [Column("minimum_nights")]
        public int Minimum_Nights { get; set; }

        [Column("number_of_reviews")]
        public short Number_Of_Reviews { get; set; }

        [Column("last_review")]
        public DateTime? Last_Review { get; set; }

        [Column("reviews_per_month")]
        public double? Reviews_Per_Month { get; set; }

        [Column("calculated_host_listings_count")]
        public int Calculated_Host_Listings_Count { get; set; }

        [Column("availability_365")]
        public short Availability_365 { get; set; }
    }
}