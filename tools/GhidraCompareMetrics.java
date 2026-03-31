import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.CodeUnit;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionManager;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.listing.Program;
import ghidra.program.model.symbol.SourceType;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.SymbolIterator;
import ghidra.program.model.symbol.SymbolTable;
import ghidra.framework.options.Options;

public class GhidraCompareMetrics extends GhidraScript {

	private static final class CommentCounts {
		int any;
		int plate;
		int pre;
		int eol;
		int repeatable;
		int post;
	}

	@Override
	protected void run() throws Exception {
		Program program = currentProgram;
		FunctionManager functionManager = program.getFunctionManager();
		SymbolTable symbolTable = program.getSymbolTable();

		int symbolCount = 0;
		int userDefinedSymbolCount = 0;
		int importedSymbolCount = 0;
		int analysisSymbolCount = 0;
		int defaultSymbolCount = 0;

		SymbolIterator symbolIterator = symbolTable.getAllSymbols(true);
		while (symbolIterator.hasNext() && !monitor.isCancelled()) {
			Symbol symbol = symbolIterator.next();
			symbolCount++;
			SourceType source = symbol.getSource();
			if (source == SourceType.USER_DEFINED) {
				userDefinedSymbolCount++;
			}
			else if (source == SourceType.IMPORTED) {
				importedSymbolCount++;
			}
			else if (source == SourceType.ANALYSIS) {
				analysisSymbolCount++;
			}
			else if (source == SourceType.DEFAULT) {
				defaultSymbolCount++;
			}
		}

		int functionCount = 0;
		int userDefinedFunctionCount = 0;
		List<String> sampleUserFunctions = new ArrayList<>();

		for (Function function : functionManager.getFunctions(true)) {
			if (monitor.isCancelled()) {
				break;
			}
			functionCount++;
			if (function.getSymbol().getSource() == SourceType.USER_DEFINED) {
				userDefinedFunctionCount++;
				if (sampleUserFunctions.size() < 40) {
					sampleUserFunctions.add(function.getName() + " @ " + function.getEntryPoint());
				}
			}
		}

		CommentCounts commentCounts = countComments(program);
		Options info = program.getOptions("Program Information");
		HashSet<String> interestingNames = new HashSet<>(Arrays.asList(
			"Executable Format",
			"Executable Location",
			"Executable MD5",
			"Executable SHA256",
			"Compiler",
			"Compiler ID",
			"Language ID",
			"PE Property[TimeDateStamp]",
			"PE Property[OriginalFilename]",
			"PE Property[FileVersion]",
			"PE Property[ProductVersion]",
			"Created With Ghidra Version"
		));

		println("PROGRAM_NAME=" + program.getName());
		println("IMAGE_BASE=" + program.getImageBase());
		for (String optionName : info.getOptionNames()) {
			if (interestingNames.contains(optionName)) {
				Object value = info.getObject(optionName, null);
				println("INFO_" + optionName.replace(' ', '_') + "=" + value);
			}
		}
		println("FUNCTION_COUNT=" + functionCount);
		println("USER_DEFINED_FUNCTION_COUNT=" + userDefinedFunctionCount);
		println("SYMBOL_COUNT=" + symbolCount);
		println("USER_DEFINED_SYMBOL_COUNT=" + userDefinedSymbolCount);
		println("IMPORTED_SYMBOL_COUNT=" + importedSymbolCount);
		println("ANALYSIS_SYMBOL_COUNT=" + analysisSymbolCount);
		println("DEFAULT_SYMBOL_COUNT=" + defaultSymbolCount);
		println("COMMENT_UNITS=" + commentCounts.any);
		println("COMMENT_PLATE=" + commentCounts.plate);
		println("COMMENT_PRE=" + commentCounts.pre);
		println("COMMENT_EOL=" + commentCounts.eol);
		println("COMMENT_REPEATABLE=" + commentCounts.repeatable);
		println("COMMENT_POST=" + commentCounts.post);
		for (String sample : sampleUserFunctions) {
			println("USER_FUNCTION=" + sample);
		}
	}

	private CommentCounts countComments(Program program) {
		CommentCounts counts = new CommentCounts();
		Listing listing = program.getListing();
		for (CodeUnit codeUnit : listing.getCodeUnits(true)) {
			if (monitor.isCancelled()) {
				break;
			}
			boolean hasAny = false;
			if (codeUnit.getComment(CodeUnit.PLATE_COMMENT) != null) {
				counts.plate++;
				hasAny = true;
			}
			if (codeUnit.getComment(CodeUnit.PRE_COMMENT) != null) {
				counts.pre++;
				hasAny = true;
			}
			if (codeUnit.getComment(CodeUnit.EOL_COMMENT) != null) {
				counts.eol++;
				hasAny = true;
			}
			if (codeUnit.getComment(CodeUnit.REPEATABLE_COMMENT) != null) {
				counts.repeatable++;
				hasAny = true;
			}
			if (codeUnit.getComment(CodeUnit.POST_COMMENT) != null) {
				counts.post++;
				hasAny = true;
			}
			if (hasAny) {
				counts.any++;
			}
		}
		return counts;
	}
}
