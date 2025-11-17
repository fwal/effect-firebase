interface MenuItemProps {
  icon: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export default function MenuItem({ icon, label, isActive, onClick }: MenuItemProps) {
  return (
    <li>
      <button
        onClick={onClick}
        className="flex items-center gap-3 px-4 py-3 rounded-lg 
                           hover:bg-gray-700 transition-colors duration-200
                           text-gray-300 hover:text-white group"
      >
        <span className="text-2xl group-hover:scale-110 transition-transform">
          {icon}
        </span>
        <span className="font-medium">{label}</span>
      </button>
    </li>
  );
}
