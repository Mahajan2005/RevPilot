import RecoveryLab from "./RecoveryLab";

type CheckoutSimulatorProps = {
  onBack: () => void;
};

/*
 * Compatibility wrapper.
 *
 * Recovery Lab now owns the complete customer simulation.
 * Keeping this component means any existing App.tsx import
 * of CheckoutSimulator will still open the new Recovery Lab.
 */
export default function CheckoutSimulator({
  onBack,
}: CheckoutSimulatorProps) {
  return <RecoveryLab onBack={onBack} />;
}
