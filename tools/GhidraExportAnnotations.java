import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.CodeUnit;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.listing.Program;
import ghidra.program.model.symbol.SourceType;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.SymbolIterator;
import ghidra.program.model.symbol.SymbolTable;

public class GhidraExportAnnotations extends GhidraScript {

	private static String esc(String s) {
		if (s == null) {
			return "";
		}
		return s.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r");
	}

	@Override
	protected void run() throws Exception {
		String outPath = getScriptArgs().length > 0 ? getScriptArgs()[0] : null;
		if (outPath == null || outPath.isEmpty()) {
			throw new IllegalArgumentException("Expected output path argument");
		}

		File outFile = new File(outPath);
		File parent = outFile.getParentFile();
		if (parent != null) {
			parent.mkdirs();
		}

		Program program = currentProgram;
		Listing listing = program.getListing();
		SymbolTable symbolTable = program.getSymbolTable();

		int count = 0;
		try (PrintWriter out = new PrintWriter(new FileWriter(outFile))) {
			out.println("# kind\taddress\tsubkind\tname_or_context\tcontent");

			SymbolIterator symbols = symbolTable.getAllSymbols(true);
			while (symbols.hasNext() && !monitor.isCancelled()) {
				Symbol sym = symbols.next();
				if (sym.getSource() != SourceType.USER_DEFINED) {
					continue;
				}
				String parentName = sym.getParentNamespace() != null ? sym.getParentNamespace().getName(true) : "";
				out.println(
					"SYMBOL\t" + sym.getAddress() + "\t" + sym.getSymbolType() + "\t" + esc(sym.getName()) + "\t" + esc(parentName)
				);
				count++;
			}

			for (Function function : listing.getFunctions(true)) {
				if (monitor.isCancelled()) {
					break;
				}
				if (function.getSymbol().getSource() == SourceType.USER_DEFINED) {
					out.println(
						"FUNCTION\t" + function.getEntryPoint() + "\tNAME\t" + esc(function.getName()) + "\t" + esc(function.getSignature().toString())
					);
					count++;
				}
			}

			for (CodeUnit cu : listing.getCodeUnits(true)) {
				if (monitor.isCancelled()) {
					break;
				}
				writeComment(out, listing, cu.getAddress(), "PLATE", cu.getComment(CodeUnit.PLATE_COMMENT));
				writeComment(out, listing, cu.getAddress(), "PRE", cu.getComment(CodeUnit.PRE_COMMENT));
				writeComment(out, listing, cu.getAddress(), "EOL", cu.getComment(CodeUnit.EOL_COMMENT));
				writeComment(out, listing, cu.getAddress(), "REPEATABLE", cu.getComment(CodeUnit.REPEATABLE_COMMENT));
				writeComment(out, listing, cu.getAddress(), "POST", cu.getComment(CodeUnit.POST_COMMENT));
			}

			for (Data data : listing.getDefinedData(true)) {
				if (monitor.isCancelled()) {
					break;
				}
				Address addr = data.getAddress();
				Symbol primary = symbolTable.getPrimarySymbol(addr);
				if (primary != null && primary.getSource() == SourceType.USER_DEFINED) {
					// already emitted in symbol pass
				}
			}
		}

		println("EXPORTED_TO=" + outFile.getAbsolutePath());
		println("EXPORTED_RECORDS=" + count);
	}

	private void writeComment(PrintWriter out, Listing listing, Address address, String type, String comment) {
		if (comment == null || comment.isEmpty()) {
			return;
		}
		Function function = listing.getFunctionContaining(address);
		String context = function != null ? function.getName() : "";
		out.println("COMMENT\t" + address + "\t" + type + "\t" + esc(context) + "\t" + esc(comment));
	}
}
