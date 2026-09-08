"""Demo: tekan Run (tombol play) atau jalankan `python3 demo.py` di terminal Karat."""

def main() -> None:
    print("Halo dari Karat!")
    total = sum(i * i for i in range(1, 11))
    print(f"Jumlah kuadrat 1..10 = {total}")


if __name__ == "__main__":
    main()
