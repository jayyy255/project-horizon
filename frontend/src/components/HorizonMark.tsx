import horizonIcon from '../assets/horizon-icon.png';

export function HorizonMark({ size = 24 }: { size?: number }) {
  return (
    <img src={horizonIcon} width={size} height={size} className="horizon-icon" alt="" aria-hidden="true" draggable={false} />
  );
}
