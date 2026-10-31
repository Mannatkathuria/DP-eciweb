// Crisp SVG representation of the Election Commission of India / Ashoka Chakra emblem
export default function EciEmblem({ size = 48, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Election Commission of India Emblem"
      role="img"
    >
      <circle cx="50" cy="50" r="47" stroke="#002855" strokeWidth="3" fill="#FFFFFF" />
      <circle cx="50" cy="50" r="43" stroke="#D97706" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
      {/* Outer tricolor arc */}
      <path d="M15 50 A35 35 0 0 1 85 50" stroke="#FF9933" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M15 50 A35 35 0 0 0 85 50" stroke="#138808" strokeWidth="3" fill="none" strokeLinecap="round" />
      
      {/* Central Ashoka Chakra */}
      <circle cx="50" cy="50" r="14" stroke="#002855" strokeWidth="2" fill="#F0F7FF" />
      <circle cx="50" cy="50" r="3" fill="#002855" />
      {/* 24 Spokes (simplified 12 spokes for crisp vector rendering) */}
      {[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345].map((deg) => (
        <line
          key={deg}
          x1="50"
          y1="50"
          x2={50 + 13 * Math.cos((deg * Math.PI) / 180)}
          y2={50 + 13 * Math.sin((deg * Math.PI) / 180)}
          stroke="#002855"
          strokeWidth="0.8"
        />
      ))}
      
      {/* Stylized Ballot Box / Vote casting icon at bottom */}
      <rect x="36" y="68" width="28" height="12" rx="2" fill="#002855" />
      <path d="M42 68 L50 62 L58 68 Z" fill="#FF9933" />
      <line x1="45" y1="73" x2="55" y2="73" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />

      {/* Stylized Ashoka Lions Pillars at top */}
      <path d="M42 22 L50 16 L58 22 L56 32 L44 32 Z" fill="#D97706" />
      <circle cx="50" cy="20" r="2.5" fill="#FFFFFF" />
      <path d="M40 32 L60 32 L58 35 L42 35 Z" fill="#002855" />
    </svg>
  );
}
