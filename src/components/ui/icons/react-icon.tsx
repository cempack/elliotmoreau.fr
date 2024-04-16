import Image from "next/image";

export default function ReactIcon({ className }: { className: string }) {
  return (
    <Image
      src={"/react-logo.svg"}
      className={className}
      alt="React Logo"
      width={64}
      height={64}
    />
  );
}

export function ReactSpinningIcon() {
  return (
    <div className="flex justify-center items-center">
      <Image
        className="w-10/12 animate-spin-slow"
        src={"/react-logo.svg"}
        alt="React Logo"
        width={120}
        height={120}
      />
    </div>
  );
}
