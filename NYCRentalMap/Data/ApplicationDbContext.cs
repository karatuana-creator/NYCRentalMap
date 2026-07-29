using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;
using NYCRentalMap.Models;

namespace NYCRentalMap.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<Rental> Rentals { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Rental>().ToTable("AB_NYC_2019");
        }
    }
}