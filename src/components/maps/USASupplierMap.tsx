import {
  ComposableMap,
  Geographies,
  Geography,
} from "react-simple-maps";

type USASupplierMapProps = {
  // Example: { CA: "#3498DB", TX: "#2ECC71" }
  stateColors?: Record<string, string>;
  onStateClick?: (stateAbbr: string) => void;
  selectedStateCode?: string;
};

const geoUrl =
  "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

export default function USASupplierMap({
  stateColors = {},
  onStateClick,
  selectedStateCode,
}: USASupplierMapProps) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <ComposableMap
        projection="geoAlbersUsa"
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={geoUrl}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const stateAbbr = (geo.properties as any)?.postal as string | undefined;

              const isSelected = stateAbbr === selectedStateCode;

              const fill = isSelected 
                ? "hsl(var(--primary))" 
                : (stateAbbr && stateColors[stateAbbr]) || "#E5E7EB";

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="#FFFFFF"
                  style={{
                    default: { outline: "none" },
                    hover: {
                      outline: "none",
                      fill: "hsl(var(--accent))",
                      cursor: "pointer",
                    },
                    pressed: { outline: "none" },
                  }}
                  onClick={() => {
                    if (stateAbbr && onStateClick) {
                      onStateClick(stateAbbr);
                    }
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}
