//! Demo: dibuka & diedit langsung di Karat.

fn fibonacci(n: u32) -> u32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

fn greet(name: &str) -> String {
    format!("Halo, {name}! Selamat datang di Karat IDE.")
}

fn main() {
    println!("{}", greet("kawan"));
    for i in 0..10 {
        println!("fib({i}) = {}", fibonacci(i));
    }
}
