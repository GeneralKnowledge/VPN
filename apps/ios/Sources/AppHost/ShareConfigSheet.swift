import SwiftUI

#if canImport(UIKit)
    import UIKit

    /// The system share sheet for a WireGuard config file. Choosing WireGuard
    /// imports it as a tunnel. The file is deleted when the sheet closes
    /// (`AppModel.finishSharing`).
    struct ShareConfigSheet: UIViewControllerRepresentable {
        let fileURL: URL

        func makeUIViewController(context: Context) -> UIActivityViewController {
            let controller = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
            controller.view.accessibilityIdentifier = "share.sheet"
            return controller
        }

        func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
    }
#else
    /// Off iOS (`swift run` on a Mac) there is no WireGuard app to hand to.
    struct ShareConfigSheet: View {
        let fileURL: URL

        var body: some View {
            Text("Config saved to \(fileURL.path)")
                .padding()
                .accessibilityIdentifier("share.sheet")
        }
    }
#endif
