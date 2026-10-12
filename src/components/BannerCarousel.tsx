import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  bgGradient: string;
  image: string;
}

const slides: Slide[] = [
  {
    id: 's1',
    title: 'Pasar Lokal Tumpang',
    subtitle: 'Belanja sembako, beras pulen, dan sayur segar langsung dari petani Malang.',
    tag: 'Segar & Asli',
    bgGradient: 'from-orange-800 to-amber-950',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80'
  },
  {
    id: 's2',
    title: 'Karya & Produk UMKM',
    subtitle: 'Kopi Robusta Lereng Semeru, keripik tempe renyah, dan madu hutan alami.',
    tag: 'Dukung UMKM',
    bgGradient: 'from-amber-800 to-orange-950',
    image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800&auto=format&fit=crop&q=80'
  },
  {
    id: 's3',
    title: 'Pengantaran Cepat Area Malang',
    subtitle: 'Melayani Kecamatan Tumpang, Poncokusumo, Pakis, Jabung, dan sekitarnya.',
    tag: 'Langsung Sampai',
    bgGradient: 'from-slate-900 to-orange-950',
    image: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=800&auto=format&fit=crop&q=80'
  }
];

export default function BannerCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, 5000);
  };

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
    resetTimer();
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % slides.length);
    resetTimer();
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl shadow-lg border border-emerald-900/10">
      <div 
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {slides.map((slide) => (
          <div
            key={slide.id}
            className={`w-full shrink-0 relative min-h-[220px] sm:min-h-[280px] md:min-h-[320px] bg-gradient-to-r ${slide.bgGradient} flex items-center overflow-hidden`}
          >
            <div className="absolute inset-0 opacity-25 mix-blend-overlay">
              <img 
                src={slide.image} 
                alt={slide.title} 
                className="w-full h-full object-cover" 
              />
            </div>
            
            <div className="relative z-10 px-6 sm:px-12 py-8 max-w-xl text-white">
              <span className="inline-block px-3 py-1 bg-white/20 border border-white/30 backdrop-blur-xs rounded-full text-xs font-bold uppercase tracking-wider text-amber-200 mb-3">
                {slide.tag}
              </span>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">
                {slide.title}
              </h2>
              <p className="mt-2 text-sm sm:text-base text-emerald-100/90 leading-relaxed max-w-md">
                {slide.subtitle}
              </p>
            </div>

            <div className="hidden sm:block absolute right-8 bottom-0 top-0 w-1/3 opacity-80 pointer-events-none">
              <img 
                src={slide.image} 
                alt={slide.title} 
                className="w-full h-full object-contain object-right drop-shadow-2xl" 
              />
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Arrows */}
      <button 
        onClick={handlePrev}
        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
        aria-label="Slide sebelumnya"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button 
        onClick={handleNext}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
        aria-label="Slide selanjutnya"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Dots Indicator */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        {slides.map((slide, idx) => (
          <button
            key={slide.id}
            onClick={() => {
              setCurrentIndex(idx);
              resetTimer();
            }}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              idx === currentIndex ? 'bg-white w-6' : 'bg-white/50'
            }`}
            aria-label={`Ke slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
