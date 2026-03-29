interface PropertiesPanelProps {
  visible: boolean
}

export function PropertiesPanel({ visible }: PropertiesPanelProps) {
  return (
    <div
      className={`fixed top-10 right-0 bottom-0 w-[280px] z-40 border-l bg-background transition-transform duration-200 ease-in-out ${
        visible ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Populated in Phase 4 */}
    </div>
  )
}
