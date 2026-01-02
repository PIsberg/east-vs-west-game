// Helper to forward clicks to the ground handler
const ClickableGroup = ({ onCanvasClick, children, ...props }: any) => {
    return (
        <group
            {...props}
            onClick={(e) => {
                e.stopPropagation();
                if (onCanvasClick) onCanvasClick(e.point.x, e.point.z);
            }}
        >
            {children}
        </group>
    );
};
